import { describe, expect, it } from 'vitest';

import { fetchTenders } from '../src/fetchListing.js';

// Live check against the real portal - skipped in CI (same lesson as the other actors
// in this portfolio: don't make CI depend on an external host with no uptime guarantee).
describe.skipIf(process.env.CI)('live fetchTenders against the real Tucuman portal', () => {
    it('fetches a real page of upcoming tenders with well-formed fields', async () => {
        const tenders = await fetchTenders(['1'], 5);

        expect(tenders.length).toBeGreaterThan(0);
        expect(tenders.length).toBeLessThanOrEqual(5);
        for (const tender of tenders) {
            expect(tender.idCompra).toMatch(/^\d+$/);
            expect(tender.estadoCompra).toBe('1');
            expect(tender.reparticion.length).toBeGreaterThan(0);
            expect(tender.tipoCompra.length).toBeGreaterThan(0);
            expect(tender.renglones.length).toBeGreaterThan(0);
            // scrapedAt must be a real, recent ISO timestamp
            expect(new Date(tender.scrapedAt).getTime()).toBeGreaterThan(Date.now() - 60_000);
        }
    }, 30_000);

    it('paginates across multiple listing pages when maxItems exceeds one page (5 items)', async () => {
        const tenders = await fetchTenders(['1'], 8);
        expect(tenders.length).toBe(8); // estado 1 has 31+ total, so this proves it advanced past page 1
        const ids = tenders.map((t) => t.idCompra);
        expect(new Set(ids).size).toBe(ids.length); // no duplicates across pages
    }, 30_000);

    it('extracts a real, currently-downloadable pliego PDF URL when one is linked', async () => {
        // estado 2 (en adjudicacion) reliably has several tenders with a live pliego link
        // (verified live 2026-09-04 - see AGENTS.md), unlike estado 1's mostly-bare sample.
        const tenders = await fetchTenders(['2'], 15);
        const withPdf = tenders.find((t) => t.pliegoPdfUrl !== null);
        expect(withPdf).toBeDefined();

        const response = await fetch(withPdf!.pliegoPdfUrl!, { method: 'HEAD' });
        expect(response.ok).toBe(true);
        expect(response.headers.get('content-type')).toContain('pdf');
    }, 30_000);

    it('respects maxItems as a hard cap across multiple estados', async () => {
        const tenders = await fetchTenders(['1', '3'], 7);
        expect(tenders.length).toBe(7);
    }, 30_000);
});
