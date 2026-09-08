import { Actor } from 'apify';
// Fixed, unique-to-this-actor named key-value store - deliberately NOT the run's default
// key-value store (Actor.getInput()'s counterpart, Actor.setValue() with no store name),
// which is created fresh per run and would not survive between scheduled runs. Using a
// stable name here is what makes "delta mode" possible at all.
export const DELTA_STATE_STORE_NAME = 'tucuman-compras-monitor-delta-state';
const STATE_KEY = 'state';
// Estado 2 alone has 3700+ historical records; estado 1 (31) and estado 3 (313) are much
// smaller. One flat cap across the whole (now cross-estado, see below) register comfortably
// covers normal week-to-week drift without the state blob growing unbounded.
export const MAX_SEEN_IDS = 6000;
function emptyState() {
    return { order: [], entries: {} };
}
function isValidState(value) {
    if (!value || typeof value !== 'object')
        return false;
    const v = value;
    return Array.isArray(v.order) && typeof v.entries === 'object' && v.entries !== null;
}
// storeName defaults to the fixed production name; tests pass a unique name per run so a
// "cold start" is guaranteed and independent of whatever local storage a previous run left
// behind (storage/ is gitignored local-dev emulation, not the real Apify cloud store).
export async function loadDeltaState(storeName = DELTA_STATE_STORE_NAME) {
    const store = await Actor.openKeyValueStore(storeName);
    const raw = await store.getValue(STATE_KEY);
    // A v1-shaped state ({ estados: {...} }) fails isValidState and is treated as absent -
    // the first v2 run on an existing schedule re-baselines rather than crashing on the old
    // shape. Disclosed in CHANGELOG.md; matches the fleet-wide convention that a state-shape
    // change is not silently made backward compatible.
    return isValidState(raw) ? raw : emptyState();
}
export async function saveDeltaState(state, storeName = DELTA_STATE_STORE_NAME) {
    const store = await Actor.openKeyValueStore(storeName);
    await store.setValue(STATE_KEY, state);
}
export function getSeenEntry(state, idCompra) {
    return state.entries[idCompra];
}
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
export function mergeSeen(state, newlyObserved, cap = MAX_SEEN_IDS) {
    const entries = { ...state.entries };
    for (const { id, estado, hash } of newlyObserved)
        entries[id] = { estado, hash };
    const order = [];
    const added = new Set();
    for (const id of [...newlyObserved.map((n) => n.id), ...state.order]) {
        if (added.has(id))
            continue;
        added.add(id);
        order.push(id);
        if (order.length >= cap)
            break;
    }
    const prunedEntries = {};
    for (const id of order) {
        const entry = entries[id];
        if (entry)
            prunedEntries[id] = entry;
    }
    return { order, entries: prunedEntries };
}
//# sourceMappingURL=state.js.map