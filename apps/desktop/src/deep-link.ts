import type { PairLinkEvent } from "@t4-code/protocol/desktop-ipc";

export interface PendingPair extends PairLinkEvent {}

const HOST = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const CODE = /^\d{6}$/u;
export function parsePairDeepLink(value: string, issuedAt = Date.now()): PendingPair | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "t4-code:" || url.hostname !== "pair" || url.username || url.password || url.search || url.hash) return null;
  const segments = url.pathname.split("/").filter((segment) => segment.length > 0);
  const hostHint = segments[0] ?? "";
  const code = segments[1] ?? "";
  if (segments.length !== 2 || !HOST.test(hostHint) || !CODE.test(code) || !Number.isFinite(issuedAt) || issuedAt < 0) return null;
  return { hostHint, code, issuedAt };
}

export class PendingPairQueue {
  private readonly values: PendingPair[] = [];
  private readonly capacity: number;
  constructor(capacity = 8) { this.capacity = capacity; }
  push(value: PendingPair): void {
    const index = this.values.findIndex((item) => item.hostHint === value.hostHint);
    if (index >= 0) this.values.splice(index, 1);
    this.values.push(value);
    while (this.values.length > Math.max(1, this.capacity)) this.values.shift();
  }
  drain(): readonly PendingPair[] {
    const result = this.values.splice(0);
    return Object.freeze(result);
  }
  size(): number {
    return this.values.length;
  }
}
