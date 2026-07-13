// Browser-native WebSocket transport. Wraps the browser's built-in WebSocket
// API into the OmpTransport shape that OmpClient expects. This is the browser
// counterpart to the desktop's UnixWebSocketTransport / RemoteWebSocketTransport
// — it uses no Node.js APIs, only the standard browser WebSocket constructor.
import type { OmpTransport, Unsubscribe } from "@t4-code/client";

export interface BrowserTransportOptions {
  /** Full WebSocket URL. Only ws: and wss: URLs are accepted. */
  readonly url: string;
  readonly protocols?: string | string[];
}

export const MAX_BROWSER_URL_LENGTH = 2048;
export const MAX_BROWSER_MESSAGE_BYTES = 4 * 1024 * 1024;
const MAX_CLOSE_REASON_LENGTH = 256;

function validateUrl(value: string): string {
  if (value.length === 0 || value.length > MAX_BROWSER_URL_LENGTH) throw new Error("invalid browser transport URL");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("invalid browser transport URL");
  }
  if ((parsed.protocol !== "ws:" && parsed.protocol !== "wss:") || parsed.username !== "" || parsed.password !== "") {
    throw new Error("invalid browser transport URL");
  }
  return parsed.toString();
}

function byteLength(value: string): number {
  return typeof TextEncoder === "undefined" ? value.length : new TextEncoder().encode(value).byteLength;
}

export class BrowserWebSocketTransport implements OmpTransport {
  private readonly url: string;
  private readonly protocols: string | string[] | undefined;
  private socket: WebSocket | undefined;
  private socketCleanup: (() => void) | undefined;
  private readonly messages = new Set<(data: string | Uint8Array) => void>();
  private readonly closes = new Set<(code?: number, reason?: string) => void>();
  private readonly errors = new Set<(error: unknown) => void>();

  constructor(options: BrowserTransportOptions) {
    this.url = validateUrl(options.url);
    this.protocols = options.protocols;
  }

  open(): Promise<void> {
    const current = this.socket;
    if (current !== undefined) {
      if (current.readyState === WebSocket.OPEN) return Promise.resolve();
      return Promise.reject(new Error("browser transport already opening"));
    }
    if (typeof WebSocket === "undefined") return Promise.reject(new Error("browser WebSocket unavailable"));

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let socket: WebSocket;
      try {
        socket = new WebSocket(this.url, this.protocols);
      } catch {
        reject(new Error("browser transport connection failed"));
        return;
      }
      socket.binaryType = "arraybuffer";
      this.socket = socket;

      const cleanup = (): void => {
        socket.removeEventListener("open", onOpen);
        socket.removeEventListener("error", onError);
        socket.removeEventListener("message", onMessage);
        socket.removeEventListener("close", onClose);
        if (this.socketCleanup === cleanup) this.socketCleanup = undefined;
      };
      const fail = (): void => {
        if (!settled) {
          settled = true;
          reject(new Error("browser transport connection failed"));
        }
      };
      const onOpen = (): void => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      const onError = (): void => {
        fail();
        for (const listener of this.errors) listener(new Error("browser transport error"));
      };
      const onMessage = (event: MessageEvent): void => {
        const data = event.data;
        if (typeof data === "string") {
          if (byteLength(data) > MAX_BROWSER_MESSAGE_BYTES) {
            for (const listener of this.errors) listener(new Error("browser transport message too large"));
            this.close();
            return;
          }
          for (const listener of this.messages) listener(data);
          return;
        }
        if (data instanceof ArrayBuffer) {
          if (data.byteLength > MAX_BROWSER_MESSAGE_BYTES) {
            for (const listener of this.errors) listener(new Error("browser transport message too large"));
            this.close();
            return;
          }
          for (const listener of this.messages) listener(new Uint8Array(data));
        }
      };
      const onClose = (event: CloseEvent): void => {
        cleanup();
        if (this.socket === socket) this.socket = undefined;
        fail();
        const reason = typeof event.reason === "string" ? event.reason.slice(0, MAX_CLOSE_REASON_LENGTH) : "";
        for (const listener of this.closes) listener(event.code, reason);
      };
      this.socketCleanup = cleanup;
      socket.addEventListener("open", onOpen);
      socket.addEventListener("error", onError);
      socket.addEventListener("message", onMessage);
      socket.addEventListener("close", onClose);
    });
  }

  send(data: string): void {
    if (byteLength(data) > MAX_BROWSER_MESSAGE_BYTES) throw new Error("browser transport message too large");
    const socket = this.socket;
    if (socket === undefined || socket.readyState !== WebSocket.OPEN) throw new Error("browser transport is not connected");
    socket.send(data);
  }

  close(): void {
    const socket = this.socket;
    this.socket = undefined;
    this.socketCleanup?.();
    this.socketCleanup = undefined;
    if (socket !== undefined) {
      try { socket.close(1000, "client closed"); } catch { /* best effort */ }
    }
    this.messages.clear();
    this.closes.clear();
    this.errors.clear();
  }

  onMessage(listener: (data: string | Uint8Array) => void): Unsubscribe {
    this.messages.add(listener);
    return () => this.messages.delete(listener);
  }

  onClose(listener: (code?: number, reason?: string) => void): Unsubscribe {
    this.closes.add(listener);
    return () => this.closes.delete(listener);
  }

  onError(listener: (error: unknown) => void): Unsubscribe {
    this.errors.add(listener);
    return () => this.errors.delete(listener);
  }
}
