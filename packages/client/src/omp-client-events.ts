import type { ProjectionStore } from "./projection.ts";
import type { OmpClientError, OmpStateSnapshot, PublicServerFrame, Unsubscribe } from "./omp-client-contracts.ts";

/** Isolates listener mutation and protects protocol callbacks from consumer exceptions. */
export class OmpClientEvents {
  private readonly stateListeners = new Set<(snapshot: OmpStateSnapshot) => void>();
  private readonly frameListeners = new Set<(frame: PublicServerFrame) => void>();
  private readonly errorListeners = new Set<(error: OmpClientError) => void>();
  get listenerCount(): number { return this.stateListeners.size + this.frameListeners.size + this.errorListeners.size; }
  onState(listener: (snapshot: OmpStateSnapshot) => void): Unsubscribe { return this.subscribe(this.stateListeners, listener); }
  onFrame(listener: (frame: PublicServerFrame) => void): Unsubscribe { return this.subscribe(this.frameListeners, listener); }
  onError(listener: (error: OmpClientError) => void): Unsubscribe { return this.subscribe(this.errorListeners, listener); }
  clear(): void {
    this.stateListeners.clear();
    this.frameListeners.clear();
    this.errorListeners.clear();
  }
  emitState(snapshot: OmpStateSnapshot): void {
    // eslint-disable-next-line unicorn/no-useless-spread -- preserve listener snapshot when callbacks unsubscribe.
    for (const listener of [...this.stateListeners]) { try { listener(snapshot); } catch { /* isolated */ } }
  }
  emitError(error: OmpClientError): void {
    // eslint-disable-next-line unicorn/no-useless-spread -- preserve listener snapshot when callbacks unsubscribe.
    for (const listener of [...this.errorListeners]) { try { listener(error); } catch { /* isolated */ } }
  }
  publish(frame: PublicServerFrame, projection: ProjectionStore | undefined): void {
    try { projection?.applyPublicFrame(frame); } catch { /* observational */ }
    // eslint-disable-next-line unicorn/no-useless-spread -- preserve listener snapshot when callbacks unsubscribe.
    for (const listener of [...this.frameListeners]) { try { listener(frame); } catch { /* isolated */ } }
  }
  private subscribe<T>(set: Set<T>, listener: T): Unsubscribe {
    set.add(listener); let active = true;
    return () => { if (!active) return; active = false; set.delete(listener); };
  }
}
