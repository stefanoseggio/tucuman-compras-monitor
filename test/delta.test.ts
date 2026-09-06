import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { applyDelta } from '../src/delta.js';
import { parseListingPage } from '../src/parsers/listing.js';
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

describe('applyDelta - (a) cold run', () => {
    it('marks every record is_new=true when the seen-set is empty, even with onlyNew=false', () => {
        const tenders = loadRealTenders('listing_estado1_pagina4.html', ESTADO1_PAGE4_URL, '1');
        const { output } = applyDelta({
            tenders,
            seenIdsByEstado: new Map(),
            onlyNew: false,
            scrapedAt: '2026-09-06T00:00:00.000Z',
            now: new Date('2026-09-06T00:00:00.000Z'),
        });

        expect(output).toHaveLength(tenders.length);
        expect(output.every((r) => r.is_new === true)).toBe(true);
    });
});

describe('applyDelta - (b) onlyNew with a fully-seen state', () => {
    it('returns zero records when every fetched id is already in the seen-set', () => {
        const tenders = loadRealTenders('listing_estado1_pagina4.html', ESTADO1_PAGE4_URL, '1');
        const seenIdsByEstado = new Map([
            ['1', new Set(tenders.map((t) => t.idCompra))] as [EstadoCompra, Set<string>],
        ]);

        const { output } = applyDelta({
            tenders,
            seenIdsByEstado,
            onlyNew: true,
            scrapedAt: '2026-09-06T00:00:00.000Z',
            now: new Date('2026-09-06T00:00:00.000Z'),
        });

        expect(output).toHaveLength(0);
    });

    it('returns only the not-yet-seen records when the seen-set is partial', () => {
        const tenders = loadRealTenders('listing_estado1_pagina4.html', ESTADO1_PAGE4_URL, '1');
        // Mark all but one (8887) as already seen.
        const alreadySeen = tenders.filter((t) => t.idCompra !== '8887').map((t) => t.idCompra);
        const seenIdsByEstado = new Map([['1', new Set(alreadySeen)] as [EstadoCompra, Set<string>]]);

        const { output } = applyDelta({
            tenders,
            seenIdsByEstado,
            onlyNew: true,
            scrapedAt: '2026-09-06T00:00:00.000Z',
            now: new Date('2026-09-06T00:00:00.000Z'),
        });

        expect(output).toHaveLength(1);
        expect(output[0].record_id).toBe('8887');
        expect(output[0].is_new).toBe(true);
    });

    it('does not cross-contaminate estados: seeing an id under estado 1 does not mark it seen under estado 3', () => {
        const tenders = loadRealTenders('listing_estado3_pagina1.html', ESTADO3_PAGE1_URL, '3');
        // Every id in this fixture is (hypothetically) already seen, but only under estado '1'.
        const seenIdsByEstado = new Map([
            ['1', new Set(tenders.map((t) => t.idCompra))] as [EstadoCompra, Set<string>],
        ]);

        const { output } = applyDelta({
            tenders,
            seenIdsByEstado,
            onlyNew: true,
            scrapedAt: '2026-09-06T00:00:00.000Z',
            now: new Date('2026-09-06T00:00:00.000Z'),
        });

        // None of these estado-3 ids were ever marked seen under estado 3 itself, so all pass.
        expect(output).toHaveLength(tenders.length);
    });
});

describe('applyDelta - (c) dateRange filtering', () => {
    it('excludes records outside the window, using real fechaAperturaSobres values (estado 3, past dates)', () => {
        const tenders = loadRealTenders('listing_estado3_pagina1.html', ESTADO3_PAGE1_URL, '3');
        // Real dates on this fixture (order of appearance): 6720=24/10/2023, 6636=13/09/2023,
        // 5996=05/01/2023, 5855=10/11/2022, 5856=09/11/2022 - only 6720 falls in the 24h
        // window ending at this fixed "now".
        const now = new Date('2023-10-25T00:00:00');

        const { output } = applyDelta({
            tenders,
            seenIdsByEstado: new Map(),
            onlyNew: false,
            dateRange: '24h',
            scrapedAt: '2023-10-25T00:00:00.000Z',
            now,
        });

        expect(output.map((r) => r.record_id)).toEqual(['6720']);
    });

    it('excludes ALL estado-1 records when dateRange is set - fechaAperturaSobres is always a future, scheduled date there', () => {
        const tenders = loadRealTenders('listing_estado1_pagina4.html', ESTADO1_PAGE4_URL, '1');
        // Real "now" (this fixture's fechaAperturaSobres values are all a few days into
        // September 2026, i.e. still in the future relative to this date).
        const now = new Date('2026-09-06T12:00:00');

        const { output } = applyDelta({
            tenders,
            seenIdsByEstado: new Map(),
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
        // 6720 is the only one within the date window; mark it already-seen so onlyNew also excludes it.
        const seenIdsByEstado = new Map([['3', new Set(['6720'])] as [EstadoCompra, Set<string>]]);

        const { output } = applyDelta({
            tenders,
            seenIdsByEstado,
            onlyNew: true,
            dateRange: '24h',
            scrapedAt: '2023-10-25T00:00:00.000Z',
            now,
        });

        expect(output).toHaveLength(0);
    });
});
