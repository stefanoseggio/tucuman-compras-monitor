import { Actor } from 'apify';

import type { EstadoCompra } from './types.js';

// Fixed, unique-to-this-actor named key-value store - deliberately NOT the run's default
// key-value store (Actor.getInput()'s counterpart, Actor.setValue() with no store name),
// which is created fresh per run and would not survive between scheduled runs. Using a
// stable name here is what makes "delta mode" possible at all.
export const DELTA_STATE_STORE_NAME = 'tucuman-compras-monitor-delta-state';

const STATE_KEY = 'state';

// A few thousand ids per estado comfortably covers normal week-to-week drift without the
// state blob growing unbounded - estado 2 alone already has 3700+ historical records, so
// "keep everything forever" is not an option.
export const MAX_SEEN_IDS_PER_ESTADO = 3000;

export interface EstadoDeltaState {
    seenIds: string[];
    lastRunAt: string;
}

export interface DeltaState {
    estados: Partial<Record<EstadoCompra, EstadoDeltaState>>;
}

function emptyState(): DeltaState {
    return { estados: {} };
}

// storeName defaults to the fixed production name; tests pass a unique name per run so a
// "cold start" is guaranteed and independent of whatever local storage a previous run left
// behind (storage/ is gitignored local-dev emulation, not the real Apify cloud store).
export async function loadDeltaState(storeName: string = DELTA_STATE_STORE_NAME): Promise<DeltaState> {
    const store = await Actor.openKeyValueStore(storeName);
    const state = await store.getValue<DeltaState>(STATE_KEY);
    return state ?? emptyState();
}

export async function saveDeltaState(state: DeltaState, storeName: string = DELTA_STATE_STORE_NAME): Promise<void> {
    const store = await Actor.openKeyValueStore(storeName);
    await store.setValue(STATE_KEY, state);
}

/** The ids already seen for one estado_compra, as of the start of this run. */
export function getSeenIds(state: DeltaState, estado: EstadoCompra): Set<string> {
    return new Set(state.estados[estado]?.seenIds ?? []);
}

/**
 * Merges this run's freshly-observed ids into the existing seen-set and caps the result.
 *
 * The source's own listing order is NOT reliably newest-first (verified live against the
 * real portal - see AGENTS.md: estado 1 is sorted by ascending scheduled opening date,
 * estado 3 by descending opening date, neither of which tracks when a tender was actually
 * added to the site), so this cannot cap by "drop whatever the source considers oldest".
 * Instead it caps by *observation* recency: `newlyObservedIds` goes first, so if the cap is
 * hit, the ids dropped are the ones this scraper has gone the longest without re-observing -
 * an LRU keyed on our own scrape history, not an assumption about the source's chronology.
 */
export function mergeSeenIds(
    existingIds: string[],
    newlyObservedIds: string[],
    cap: number = MAX_SEEN_IDS_PER_ESTADO,
): string[] {
    const merged: string[] = [];
    const added = new Set<string>();

    for (const id of [...newlyObservedIds, ...existingIds]) {
        if (added.has(id)) continue;
        added.add(id);
        merged.push(id);
        if (merged.length >= cap) break;
    }

    return merged;
}
