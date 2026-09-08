import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { getSeenEntry, loadDeltaState, mergeSeen, saveDeltaState } from '../src/state.js';

// Each test uses its own randomly-named store so runs never see another test's (or a
// previous local run's) leftover state - storage/ is gitignored local-dev emulation, not
// the real Apify cloud key-value store, so this never touches production data.
function freshStoreName(): string {
    return `test-tucuman-delta-state-${randomUUID()}`;
}

describe('loadDeltaState (cold start)', () => {
    it('returns an empty state when nothing has been saved yet', async () => {
        const state = await loadDeltaState(freshStoreName());
        expect(state.order).toEqual([]);
        expect(getSeenEntry(state, '8900')).toBeUndefined();
    });

    it('treats a v1-shaped state (per-estado seenIds) as absent rather than crashing', async () => {
        const storeName = freshStoreName();
        // Raw v1 shape, written directly (bypassing saveDeltaState, which only ever writes v2).
        const { Actor } = await import('apify');
        const store = await Actor.openKeyValueStore(storeName);
        await store.setValue('state', { estados: { '1': { seenIds: ['8900'], lastRunAt: 'x' } } });

        const state = await loadDeltaState(storeName);
        expect(state.order).toEqual([]);
        expect(getSeenEntry(state, '8900')).toBeUndefined();
    });
});

describe('saveDeltaState / loadDeltaState round-trip', () => {
    it('persists and reloads entries keyed by id, cross-estado', async () => {
        const storeName = freshStoreName();
        const saved = {
            order: ['8900', '8891'],
            entries: {
                '8900': { estado: '1' as const, hash: 'h1' },
                '8891': { estado: '3' as const, hash: 'h2' },
            },
        };

        await saveDeltaState(saved, storeName);
        const reloaded = await loadDeltaState(storeName);

        expect(getSeenEntry(reloaded, '8900')).toEqual({ estado: '1', hash: 'h1' });
        expect(getSeenEntry(reloaded, '8891')).toEqual({ estado: '3', hash: 'h2' });
        expect(getSeenEntry(reloaded, 'never-seen')).toBeUndefined();
    });
});

describe('mergeSeen', () => {
    it('adds newly-observed ids and keeps their estado + hash', () => {
        const merged = mergeSeen({ order: [], entries: {} }, [{ id: '8900', estado: '1', hash: 'h1' }]);
        expect(merged.order).toEqual(['8900']);
        expect(merged.entries['8900']).toEqual({ estado: '1', hash: 'h1' });
    });

    it('overwrites an existing id with its new estado/hash (status change or amendment)', () => {
        const state = { order: ['8900'], entries: { '8900': { estado: '1' as const, hash: 'h1' } } };
        const merged = mergeSeen(state, [{ id: '8900', estado: '3', hash: 'h2' }]);
        expect(merged.entries['8900']).toEqual({ estado: '3', hash: 'h2' });
        expect(merged.order).toEqual(['8900']); // still present exactly once, not duplicated
    });

    it('puts newly-observed ids first (observation-recency order)', () => {
        const state = {
            order: ['old1', 'old2'],
            entries: { old1: { estado: '1' as const, hash: 'a' }, old2: { estado: '1' as const, hash: 'b' } },
        };
        const merged = mergeSeen(state, [
            { id: 'new1', estado: '1', hash: 'c' },
            { id: 'new2', estado: '1', hash: 'd' },
        ]);
        expect(merged.order).toEqual(['new1', 'new2', 'old1', 'old2']);
    });

    it('caps the result at the given size, dropping the least-recently-observed ids and their entries', () => {
        const state = {
            order: ['old1', 'old2', 'old3'],
            entries: {
                old1: { estado: '1' as const, hash: 'a' },
                old2: { estado: '1' as const, hash: 'b' },
                old3: { estado: '1' as const, hash: 'c' },
            },
        };
        const merged = mergeSeen(
            state,
            [
                { id: 'new1', estado: '1', hash: 'd' },
                { id: 'new2', estado: '1', hash: 'e' },
            ],
            4,
        );
        expect(merged.order).toEqual(['new1', 'new2', 'old1', 'old2']);
        expect(merged.order).not.toContain('old3');
        expect(merged.entries).not.toHaveProperty('old3'); // pruned entries, not just order
    });

    it('never grows unbounded across repeated merges', () => {
        let state = { order: [], entries: {} };
        for (let i = 0; i < 50; i++) {
            state = mergeSeen(state, [{ id: `id-${i}`, estado: '1', hash: 'x' }], 10);
        }
        expect(state.order.length).toBeLessThanOrEqual(10);
        expect(state.order[0]).toBe('id-49'); // the most recently observed id is always kept
        expect(Object.keys(state.entries).length).toBeLessThanOrEqual(10);
    });
});
