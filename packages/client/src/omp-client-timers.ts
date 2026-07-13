import type { TimerScheduler } from "./omp-client-contracts.ts";

export interface ClientTimer { active: boolean; handle: unknown; }

/** Owns every scheduled callback so close/reconnect can cancel without leaks. */
export class ClientTimerRegistry {
  private readonly active = new Set<ClientTimer>();
  private readonly scheduler: TimerScheduler;
  constructor(scheduler: TimerScheduler) {
    this.scheduler = scheduler;
  }
  get size(): number { return this.active.size; }
  schedule(callback: () => void, delayMs: number): ClientTimer {
    const timer: ClientTimer = { active: true, handle: undefined };
    timer.handle = this.scheduler.setTimeout(() => {
      if (!timer.active) return;
      timer.active = false;
      this.active.delete(timer);
      callback();
    }, Math.max(0, delayMs));
    this.active.add(timer);
    return timer;
  }
  clear(timer: ClientTimer): void {
    if (!timer.active) return;
    timer.active = false;
    this.active.delete(timer);
    this.scheduler.clearTimeout(timer.handle);
  }
  clearAll(): void {
    for (const timer of this.active) this.clear(timer);
  }
}
