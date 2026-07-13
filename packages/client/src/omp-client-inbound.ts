import { MAX_INBOUND_BYTES, MAX_INBOUND_FRAMES } from "./omp-client-contracts.ts";

type RawFrame = string | Uint8Array;
interface InboundItem { readonly generation: number; readonly raw: RawFrame; readonly bytes: number; }
type GenerationCheck = () => number;
type ClosedCheck = () => boolean;
type FrameHandler = (raw: RawFrame, generation: number) => void | Promise<void>;
type OverflowHandler = () => void;

/** Serializes transport callbacks and bounds memory before protocol decoding. */
export class InboundFrameQueue {
  private readonly queue: InboundItem[] = [];
  private bytes = 0;
  private draining = false;
  private readonly generation: GenerationCheck;
  private readonly closed: ClosedCheck;
  private readonly handle: FrameHandler;
  private readonly overflow: OverflowHandler;
  constructor(generation: GenerationCheck, closed: ClosedCheck, handle: FrameHandler, overflow: OverflowHandler) {
    this.generation = generation;
    this.closed = closed;
    this.handle = handle;
    this.overflow = overflow;
  }
  enqueue(raw: RawFrame, generation: number): void {
    if (generation !== this.generation() || this.closed()) return;
    const bytes = typeof raw === "string" ? raw.length * 2 : raw.byteLength;
    if (this.queue.length >= MAX_INBOUND_FRAMES || this.bytes + bytes > MAX_INBOUND_BYTES) {
      this.clear();
      this.overflow();
      return;
    }
    this.queue.push({ generation, raw, bytes });
    this.bytes += bytes;
    void this.drain();
  }
  clear(): void { this.queue.length = 0; this.bytes = 0; }
  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift();
        if (item === undefined) continue;
        this.bytes -= item.bytes;
        if (item.generation !== this.generation() || this.closed()) {
          this.clear();
          return;
        }
        const result = this.handle(item.raw, item.generation);
        if (result instanceof Promise) await result;
      }
    } finally { this.draining = false; }
  }
}
