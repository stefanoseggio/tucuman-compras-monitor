import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { applyDelta } from '../src/delta.js';
import { fingerprintOf } from '../src/fingerprint.js';
import { parseListingPage } from '../src/parsers/listing.js';
import type { DeltaState } from '../src/state.js';
import type { EstadoCompra, TenderRecord } from '../src/types.js';

const fixturesDir = fileURLToPath(new URL('./fixtures', import.meta.url));

function loadFixtureHtml(name: string): string {
    const buffer = readFileSync(`${fixturesDir}/${name}`);
    return new TextDecoder('iso-8859-1').decode(buffer);
}

// Wraps real parsed tenders the same way src/fetchListing.ts does, without needing network -
// no fixture is fabricated here, only the estado/listingPageUrl/scrapedAt wrapping fetchListing
// itself adds on top of parseListingPage's real output.
function loadRealTenders(fixture: string, pageUrl: string, estado: EstadoCompra): TenderRecord[] {
    const { items } = parseListingPage(loadFixtureHtml(fixture), pageUrl);
    return items.map((item) => ({
        ...item,
        estadoCompra: estado,
        estadoCompraLabel: 'test',
        listingPageUrl: pageUrl,
        scrapedAt: '2020-01-01T00:00:00.000Z',
    }));
}

const ESTADO1_PAGE4_URL =
    'https://comprasbys.tucuman.gob.ar/ver_llamados_compras_avanzado.php?n=1&pagina_actual=4&estado_compra=1';
const ESTADO3_PAGE1_URL =
    'https://comprasbys.tucuman.gob.ar/ver_llamados_compras_avanzado.php?n=1&pagina_actual=1&estado_compra=3';

const EMPTY_STATE: DeltaState = { order: [], entries: {} };

function stateWith(entries: Record<string, { estado: EstadoCompra; hash: string }>): DeltaState {
    return { order: Object.keys(entries), entries };
}

describe('applyDelta - event classification', () => {
    it('classifies an unseen id as NEW_LISTING, even with onlyNew=false', () => {
        const tenders = loadRealTenders('listing_estado1_pagina4.html', ESTADO1_PAGE4_URL, '1');
        const { output } = applyDelta({
            tenders,
            state: EMPTY_STATE,
            onlyNew: false,
            scrapedAt: '2026-09-06T00:00:00.000Z',
            now: new Date('2026-09-06T00:00:00.000Z'),
        });

        expect(output).toHaveLength(tenders.length);
        expect(output.every((r) => r.event_type === 'NEW_LISTING' && r.is_new === true)).toBe(true);
        expect(output.every((r) => r.previousEstado === null)).toBe(true);
    });

    it('classifies a known id under a DIFFERENT estado as STATUS_CHANGE, with previousEstado set', () => {
        const tenders = loadRealTenders('listing_estado3_pagina1.html', ESTADO3_PAGE1_URL, '3');
        const target = tenders[0];
        const state = stateWith({ [target.idCompra]: { estado: '1', hash: 'stale-hash-from-estado-1' } });

        const { output } = applyDelta({
            tenders: [target],
            state,
            onlyNew: false,
            scrapedAt: '2026-09-06T00:00:00.000Z',
            now: new Date('2026-09-06T00:00:00.000Z'),
        });

        expect(output).toHaveLength(1);
        expect(output[0].event_type).toBe('STATUS_CHANGE');
        expect(output[0].is_new).toBe(false); // it WAS seen before, just under a different estado
        expect(output[0].previousEstado).toBe('1');
    });

    it('classifies a known id, same estado, changed content as UPDATED', () => {
        const tenders = loadRealTenders('listing_estado1_pagina4.html', ESTADO1_PAGE4_URL, '1');
        const target = tenders[0];
        const state = stateWith({ [target.idCompra]: { estado: '1', hash: 'a-hash-that-will-never-match' } });

        const { output } = applyDelta({
            tenders: [target],
            state,
            onlyNew: false,
            scrapedAt: '2026-09-06T00:00:00.000Z',
            now: new Date('2026-09-06T00:00:00.000Z'),
        });

        expect(output).toHaveLength(1);
        expect(output[0].event_type).toBe('UPDATED');
        expect(output[0].previousEstado).toBeNull(); // only set for STATUS_CHANGE
    });

    it('classifies a known id, same estado, unchanged content as UNCHANGED - delivered only when onlyNew=false', () => {
        const tenders = loadRealTenders('listing_estado1_pagina4.html', ESTADO1_PAGE4_URL, '1');
        const target = tenders[0];
        const state = stateWith({ [target.idCompra]: { estado: '1', hash: fingerprintOf(target) } });

        const full = applyDelta({
            tenders: [target],
            state,
            onlyNew: false,
            scrapedAt: '2026-09-06T00:00:00.000Z',
            now: new Date('2026-09-06T00:00:00.000Z'),
        });
        expect(full.output).toHaveLength(1);
        expect(full.output[0].event_type).toBe('UNCHANGED');

        const delta = applyDelta({
            tenders: [target],
            state,
            onlyNew: true,
            scrapedAt: '2026-09-06T00:00:00.000Z',
            now: new Date('2026-09-06T00:00:00.000Z'),
        });
        expect(delta.output).toHaveLength(0);
    });

    it('contentHash on the output matches fingerprintOf of the same tender', () => {
        const tenders = loadRealTenders('listing_estado1_pagina4.html', ESTADO1_PAGE4_URL, '1');
        const { output } = applyDelta({
            tenders: [tenders[0]],
            state: EMPTY_STATE,
            onlyNew: false,
            scrapedAt: 'x',
            now: new Date('2026-09-06T00:00:00.000Z'),
        });
        expect(output[0].contentHash).toBe(fingerprintOf(tenders[0]));
    });
});

describe('applyDelta - onlyNew', () => {
    it('returns zero records when every fetched id is already seen, unchanged, same estado', () => {
        const tenders = loadRealTenders('listing_estado1_pagina4.html', ESTADO1_PAGE4_URL, '1');
        const entries = Object.fromEntries(tenders.map((t) => [t.idCompra, { estado: '1' as const, hash: fingerprintOf(t) }]));

        const { output } = applyDelta({
            tenders,
            state: stateWith(entries),
            onlyNew: true,
            scrapedAt: '2026-09-06T00:00:00.000Z',
            now: new Date('2026-09-06T00:00:00.000Z'),
        });

        expect(output).toHaveLength(0);
    });

    it('returns only the changed/new records when the state is partial', () => {
        const tenders = loadRealTenders('listing_estado1_pagina4.html', ESTADO1_PAGE4_URL, '1');
        // Mark all but one (8887) as already seen, unchanged.
        const entries = Object.fromEntries(
            tenders.filter((t) => t.idCompra !== '8887').map((t) => [t.idCompra, { estado: '1' as const, hash: fingerprintOf(t) }]),
        );

        const { output } = applyDelta({
            tenders,
            state: stateWith(entries),
            onlyNew: true,
            scrapedAt: '2026-09-06T00:00:00.000Z',
            now: new Date('2026-09-06T00:00:00.000Z'),
        });

        expect(output).toHaveLength(1);
        expect(output[0].record_id).toBe('8887');
        expect(output[0].event_type).toBe('NEW_LISTING');
    });
});

describe('applyDelta - eventTypes filter', () => {
    it('restricts output to the requested event types only', () => {
        const tenders = loadRealTenders('listing_estado1_pagina4.html', ESTADO1_PAGE4_URL, '1');
        const [a, b] = tenders;
        const state = stateWith({
            [a.idCompra]: { estado: '3', hash: 'stale' }, // -> STATUS_CHANGE
            // b is unseen -> NEW_LISTING
        });

        const { output } = applyDelta({
            tenders: [a, b],
            state,
            onlyNew: false,
            eventTypes: ['STATUS_CHANGE'],
            scrapedAt: 'x',
            now: new Date('2026-09-06T00:00:00.000Z'),
        });

        expect(output).toHaveLength(1);
        expect(output[0].record_id).toBe(a.idCompra);
        expect(output[0].event_type).toBe('STATUS_CHANGE');
    });
});

describe('applyDelta - dateRange filtering', () => {
    it('excludes records outside the window, using real fechaAperturaSobres values (estado 3, past dates)', () => {
        const tenders = loadRealTenders('listing_estado3_pagina1.html', ESTADO3_PAGE1_URL, '3');
        // Real dates on this fixture (order of appearance): 6720=24/10/2023, 6636=13/09/2023,
        // 5996=05/01/2023, 5855=10/11/2022, 5856=09/11/2022 - only 6720 falls in the 24h
        // window ending at this fixed "now".
        const now = new Date('2023-10-25T00:00:00');

        const { output } = applyDelta({
            tenders,
            state: EMPTY_STATE,
            onlyNew: false,
            dateRange: '24h',
            scrapedAt: '2023-10-25T00:00:00.000Z',
            now,
        });

        expect(output.map((r) => r.record_id)).toEqual(['6720']);
    });

    it('excludes ALL estado-1 records when dateRange is set - fechaAperturaSobres is always a future, scheduled date there', () => {
        const tenders = loadRealTenders('listing_estado1_pagina4.html', ESTADO1_PAGE4_URL, '1');
        const now = new Date('2026-09-06T12:00:00');

        const { output } = applyDelta({
            tenders,
            state: EMPTY_STATE,
            onlyNew: false,
            dateRange: '30d',
            scrapedAt: '2026-09-06T12:00:00.000Z',
            now,
        });

        expect(output).toHaveLength(0);
    });

    it('combines with onlyNew (both filters are independent, applied together)', () => {
        const tenders = loadRealTenders('listing_estado3_pagina1.html', ESTADO3_PAGE1_URL, '3');
        const now = new Date('2023-10-25T00:00:00');
        // 6720 is the only one within the date window; mark it already-seen+unchanged so onlyNew also excludes it.
        const target = tenders.find((t) => t.idCompra === '6720')!;
        const state = stateWith({ '6720': { estado: '3', hash: fingerprintOf(target) } });

        const { output } = applyDelta({
            tenders,
            state,
            onlyNew: true,
            dateRange: '24h',
            scrapedAt: '2023-10-25T00:00:00.000Z',
            now,
        });

        expect(output).toHaveLength(0);
    });
});
