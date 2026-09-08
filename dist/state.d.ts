import type { EstadoCompra } from './types.js';
export declare const DELTA_STATE_STORE_NAME = "tucuman-compras-monitor-delta-state";
export declare const MAX_SEEN_IDS = 6000;
export interface SeenEntry {
    /** The estado_compra this id was last observed under - lets a later run tell a real
     *  status change (1 -> 2 -> 3) apart from a same-estado amendment. */
    estado: EstadoCompra;
    /** sha1 content fingerprint (see src/fingerprint.ts) as of the last time this id was pushed. */
    hash: string;
}
/**
 * v2: ONE flat map keyed by idCompra, not one seen-set per estado_compra. v1 scoped seen-ids
 * per estado so a tender progressing 1 -> 3 would correctly show is_new=true again under its
 * new estado - but that design cannot itself tell the difference between "this id is
 * genuinely new to estado 3" and "this id just moved here from estado 1", which is exactly
 * what STATUS_CHANGE needs to know. A single cross-estado map with the last-seen estado
 * attached gives both: is_new is still `!seen[id]` (identical meaning to v1), and comparing
 * `seen[id].estado` to the current estado recovers the transition v1 explicitly disclosed as
 * out of scope (see AGENTS.md "Delta engine v2").
 */
export interface DeltaState {
    /** Ids in observation-recency order, most-recently-observed first - see mergeSeen. */
    order: string[];
    entries: Record<string, SeenEntry>;
}
export declare function loadDeltaState(storeName?: string): Promise<DeltaState>;
export declare function saveDeltaState(state: DeltaState, storeName?: string): Promise<void>;
export declare function getSeenEntry(state: DeltaState, idCompra: string): SeenEntry | undefined;
/**
 * Merges this run's freshly-observed (id, estado, hash) triples into the state and caps the
 * result by *observation* recency, not by the source's own ordering.
 *
 * The source's own listing order is NOT reliably newest-first (verified live - see
 * AGENTS.md: estado 1 is sorted by ascending scheduled opening date, estado 3 by descending
 * opening date, neither of which tracks when a tender was actually added to the site), so
 * this cannot cap by "drop whatever the source considers oldest". Instead, `newlyObserved`
 * goes to the front of `order`, so if the cap is hit, the ids dropped are whichever this
 * scraper itself has gone longest without re-observing - an LRU keyed on our own scrape
 * history, not an assumption about the source's chronology (same reasoning as v1's
 * mergeSeenIds, now applied to one flat map instead of one array per estado).
 */
export declare function mergeSeen(state: DeltaState, newlyObserved: {
    id: string;
    estado: EstadoCompra;
    hash: string;
}[], cap?: number): DeltaState;
//# sourceMappingURL=state.d.ts.map