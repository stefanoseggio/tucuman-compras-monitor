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
export function buildOutputRecord(tender, options) {
    const { scrapedAt: _droppedScrapedAt, listingPageUrl, ...rest } = tender;
    return {
        ...rest,
        record_id: tender.idCompra,
        event_type: options.eventType,
        scraped_at: options.scrapedAt,
        is_new: options.isNew,
        previousEstado: options.previousEstado,
        contentHash: options.contentHash,
        source_url: `${listingPageUrl}#myModal${tender.idCompra}`,
    };
}
//# sourceMappingURL=envelope.js.map