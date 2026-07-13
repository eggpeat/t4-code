import { hostId as brandHostId } from "@t4-code/protocol";
import { sessionViewId } from "../../platform/live-workspace.ts";

export interface LiveCreateAddress { readonly targetId: string; readonly hostId: string; readonly projectId: string; }
export interface LiveCreateResult { readonly viewId: string; }
export interface LiveCreateController {
  getSnapshot(): {
    targetHosts: ReadonlyMap<string, string>;
    projection: { sessionIndex: ReadonlyMap<string, { hostId: string; sessionId: string; project: { projectId: string } }> };
  };
  subscribeFrames(filter: { targetId: string; hostId: string; types: readonly string[] }, listener: (event: { frame: unknown }) => void): () => void;
  command(targetId: string, request: { hostId: string; command: string; args: Record<string, unknown> }): Promise<{ accepted: boolean; requestId: string }>;
}

const timeoutError = () => new Error("Timed out waiting for the host to create a session.");
function protocolError(message: string): Error { return new Error(`Invalid host response: ${message}`); }

export async function createLiveSession(
  controller: LiveCreateController,
  address: LiveCreateAddress,
  title?: string,
  timeoutMs = 15_000,
): Promise<LiveCreateResult> {
  if (controller.getSnapshot().targetHosts.get(address.targetId) !== address.hostId) {
    throw new Error("Project host binding is no longer available.");
  }
  const pending = new Map<string, { command: string; resolve: (f: Record<string, unknown>) => void; reject: (e: Error) => void }>();
  const early: Record<string, Record<string, unknown>> = {};
  const earlyIds: string[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  let unsubscribe: () => void = () => undefined;
  const failAll = (error: Error) => { timedOut = true; for (const waiter of pending.values()) waiter.reject(error); pending.clear(); };
  unsubscribe = controller.subscribeFrames({ targetId: address.targetId, hostId: address.hostId, types: ["response"] }, (event) => {
    const frame = event.frame as Record<string, unknown>;
    const requestId = typeof frame.requestId === "string" ? frame.requestId : undefined;
    if (requestId === undefined) return;
    const waiter = pending.get(requestId);
    if (waiter === undefined) {
      if (earlyIds.length >= 64) delete early[earlyIds.shift()!];
      early[requestId] = frame; earlyIds.push(requestId); return;
    }
    pending.delete(requestId);
    if (frame.command !== waiter.command) waiter.reject(protocolError("response command did not match request."));
    else if (frame.ok !== true) waiter.reject(new Error(`Host rejected ${waiter.command}.`));
    else waiter.resolve(frame);
  });
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { failAll(timeoutError()); reject(timeoutError()); }, timeoutMs); });
  const response = async (command: string, args: Record<string, unknown>) => {
    const work = (async () => {
      const result = await controller.command(address.targetId, { hostId: brandHostId(address.hostId), command, args });
      if (!result.accepted) throw new Error(`Host rejected ${command}.`);
      const buffered = early[result.requestId];
      if (buffered !== undefined) { delete early[result.requestId]; if (buffered.command !== command) throw protocolError("response command did not match request."); if (buffered.ok !== true) throw new Error(`Host rejected ${command}.`); return buffered; }
      if (timedOut) throw timeoutError();
      return await new Promise<Record<string, unknown>>((resolve, reject) => pending.set(result.requestId, { command, resolve, reject }));
    })();
    return Promise.race([work, deadline]);
  };
  try {
    const created = await response("session.create", title === undefined ? { projectId: address.projectId } : { projectId: address.projectId, title });
    const session = (created.result as Record<string, unknown> | undefined)?.session;
    if (typeof session !== "object" || session === null) throw protocolError("session.create did not return a session.");
    const s = session as Record<string, unknown>;
    const project = s.project as Record<string, unknown> | undefined;
    if (s.hostId !== address.hostId || project?.projectId !== address.projectId || typeof s.sessionId !== "string" || s.sessionId === "") throw protocolError("session.create returned a mismatched session.");
    await response("session.list", {});
    for (const ref of controller.getSnapshot().projection.sessionIndex.values()) if (ref.hostId === address.hostId && ref.project.projectId === address.projectId && ref.sessionId === s.sessionId) return { viewId: sessionViewId(address.hostId, s.sessionId) };
    throw protocolError("session.list did not include the created session.");
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    unsubscribe(); pending.clear(); for (const id of earlyIds) delete early[id]; earlyIds.length = 0;
  }
}
