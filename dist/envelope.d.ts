import type { EstadoCompra, EventType, TenderOutputRecord, TenderRecord } from './types.js';
/**
 * Builds the standardized delta-engine envelope for one tender and drops the two fields it
 * replaces (`scrapedAt` -> `scraped_at`, `listingPageUrl` -> `source_url`).
 *
 * `source_url` has no perfect source: there is no live, separate per-tender detail page on
 * this portal (`detalle_llamado.php?id_compra=N` is dead - commented out of the live HTML,
 * see AGENTS.md) - the closest real, working, fetchable pointer to exactly this record is its
 * own listing page plus its Bootstrap modal's own DOM id as a URL fragment, which at least
 * disambiguates it from the other tenders on the same listing page.
 */
export declare function buildOutputRecord(tender: TenderRecord, options: {
    isNew: boolean;
    eventType: EventType;
    previousEstado: EstadoCompra | null;
    contentHash: string;
    scrapedAt: string;
}): TenderOutputRecord;
//# sourceMappingURL=envelope.d.ts.map