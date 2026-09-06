import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { getSeenIds, loadDeltaState, mergeSeenIds, saveDeltaState } from '../src/state.js';

// Each test uses its own randomly-named store so runs never see another test's (or a
// previous local run's) leftover state - storage/ is gitignored local-dev emulation, not
// the real Apify cloud key-value store, so this never touches production data.
function freshStoreName(): string {
    return `test-tucuman-delta-state-${randomUUID()}`;
}

describe('loadDeltaState (cold start)', () => {
    it('returns an empty state when nothing has been saved yet', async () => {
        const state = await loadDeltaState(freshStoreName());
        expect(state.estados).toEqual({});
        expect(getSeenIds(state, '1').size).toBe(0);
    });
});

describe('saveDeltaState / loadDeltaState round-trip', () => {
    it('persists and reloads seenIds per estado', async () => {
        const storeName = freshStoreName();
        const saved = { estados: { '1': { seenIds: ['8900', '8891'], lastRunAt: '2026-09-06T00:00:00.000Z' } } };

        await saveDeltaState(saved, storeName);
        const reloaded = await loadDeltaState(storeName);

        expect(getSeenIds(reloaded, '1')).toEqual(new Set(['8900', '8891']));
        expect(getSeenIds(reloaded, '3').size).toBe(0); // estado never written stays empty
        expect(reloaded.estados['1']?.lastRunAt).toBe('2026-09-06T00:00:00.000Z');
    });
});

describe('mergeSeenIds', () => {
    it('keeps ids from both lists, de-duplicated', () => {
        const merged = mergeSeenIds(['a', 'b'], ['c', 'a']);
        expect(merged).toEqual(['c', 'a', 'b']);
    });

    it('puts newly-observed ids first (observation-recency order)', () => {
        const merged = mergeSeenIds(['old1', 'old2'], ['new1', 'new2']);
        expect(merged).toEqual(['new1', 'new2', 'old1', 'old2']);
    });

    it('caps the result at the given size, dropping the least-recently-observed ids', () => {
        const merged = mergeSeenIds(['old1', 'old2', 'old3'], ['new1', 'new2'], 4);
        expect(merged).toEqual(['new1', 'new2', 'old1', 'old2']);
        expect(merged).not.toContain('old3');
    });

    it('never grows unbounded across repeated merges', () => {
        let seenIds: string[] = [];
        for (let i = 0; i < 50; i++) {
            seenIds = mergeSeenIds(seenIds, [`id-${i}`], 10);
        }
        expect(seenIds.length).toBeLessThanOrEqual(10);
        expect(seenIds[0]).toBe('id-49'); // the most recently observed id is always kept
    });
});
