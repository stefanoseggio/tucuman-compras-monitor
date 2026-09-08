import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildOutputRecord } from '../src/envelope.js';
import { parseListingPage } from '../src/parsers/listing.js';
import type { TenderRecord } from '../src/types.js';

const fixturesDir = fileURLToPath(new URL('./fixtures', import.meta.url));

function loadFixtureHtml(name: string): string {
    // Same real-bytes, same-decoding-path fixture loading as test/parsers/listing.test.ts.
    const buffer = readFileSync(`${fixturesDir}/${name}`);
    return new TextDecoder('iso-8859-1').decode(buffer);
}

const PAGE_URL =
    'https://comprasbys.tucuman.gob.ar/ver_llamados_compras_avanzado.php?n=1&pagina_actual=4&estado_compra=1';

function realTender(): TenderRecord {
    const html = loadFixtureHtml('listing_estado1_pagina4.html');
    const { items } = parseListingPage(html, PAGE_URL);
    const parsedTender = items.find((t) => t.idCompra === '8898')!;
    return {
        ...parsedTender,
        estadoCompra: '1',
        estadoCompraLabel: 'Apertura proxima',
        listingPageUrl: PAGE_URL,
        scrapedAt: '2020-01-01T00:00:00.000Z', // deliberately stale - must never leak into the output
    };
}

const BASE_OPTS = { isNew: true, eventType: 'NEW_LISTING' as const, previousEstado: null, contentHash: 'h', scrapedAt: '2026-09-06T00:00:00.000Z' };

describe('buildOutputRecord', () => {
    it('reuses idCompra verbatim as record_id, without hashing', () => {
        const output = buildOutputRecord(realTender(), BASE_OPTS);
        expect(output.record_id).toBe('8898');
        expect(output.idCompra).toBe('8898'); // original field kept too - only scrapedAt/listingPageUrl are replaced
    });

    it('passes event_type, previousEstado and contentHash through exactly as given', () => {
        const output = buildOutputRecord(realTender(), {
            ...BASE_OPTS,
            eventType: 'STATUS_CHANGE',
            previousEstado: '1',
            contentHash: 'abc123',
        });
        expect(output.event_type).toBe('STATUS_CHANGE');
        expect(output.previousEstado).toBe('1');
        expect(output.contentHash).toBe('abc123');
    });

    it('stamps the caller-provided scraped_at, not the stale per-page scrapedAt on the input', () => {
        const output = buildOutputRecord(realTender(), { ...BASE_OPTS, isNew: false });
        expect(output.scraped_at).toBe('2026-09-06T00:00:00.000Z');
    });

    it('passes is_new through exactly as given, for both true and false', () => {
        expect(buildOutputRecord(realTender(), { ...BASE_OPTS, isNew: true }).is_new).toBe(true);
        expect(buildOutputRecord(realTender(), { ...BASE_OPTS, isNew: false }).is_new).toBe(false);
    });

    it("builds source_url from the listing page URL plus this record's own modal id", () => {
        const output = buildOutputRecord(realTender(), BASE_OPTS);
        expect(output.source_url).toBe(`${PAGE_URL}#myModal8898`);
    });

    it('drops the replaced scrapedAt/listingPageUrl fields from the final output', () => {
        const output = buildOutputRecord(realTender(), BASE_OPTS);
        expect(output).not.toHaveProperty('scrapedAt');
        expect(output).not.toHaveProperty('listingPageUrl');
    });

    it('keeps every other original tender field untouched', () => {
        const output = buildOutputRecord(realTender(), BASE_OPTS);
        expect(output.reparticion).toBe('MINISTERIO DE SEGURIDAD - DEPARTAMENTO GENERAL DE POLICIA');
        expect(output.numeroExpediente).toBe('499/219-T-2026');
        expect(output.estadoCompra).toBe('1');
    });
});
