import type { TenderOutputRecord, TenderRecord } from './types.js';

// Every genuinely-new record defaults to this. This actor does not do field-level
// diffing/UPDATE detection between runs (out of scope for this pass - see AGENTS.md "Known
// limitations"), so it has no defensible signal more specific than "this is a listing" - a
// tender that has moved from estado 1 to estado 3 between runs is exposed as a fresh
// NEW_LISTING under estado 3 (see src/state.ts for why that is the *correct* is_new
// computation, not a bug), not as some invented "AWARDED" event type this pass cannot back
// with real transition detection.
const DEFAULT_EVENT_TYPE = 'NEW_LISTING';

/**
 * Builds the standardized 5-field delta-engine envelope for one tender and drops the two
 * fields it replaces (`scrapedAt` -> `scraped_at`, `listingPageUrl` -> `source_url`).
 *
 * `source_url` has no perfect source: there is no live, separate per-tender detail page on
 * this portal (`detalle_llamado.php?id_compra=N` is dead - commented out of the live HTML,
 * see AGENTS.md point 2) - the closest real, working, fetchable pointer to exactly this
 * record is its own listing page plus its Bootstrap modal's own DOM id as a URL fragment,
 * which at least disambiguates it from the other tenders on the same listing page.
 */
export function buildOutputRecord(
    tender: TenderRecord,
    options: { isNew: boolean; scrapedAt: string },
): TenderOutputRecord {
    const { scrapedAt: _droppedScrapedAt, listingPageUrl, ...rest } = tender;

    return {
        ...rest,
        record_id: tender.idCompra,
        event_type: DEFAULT_EVENT_TYPE,
        scraped_at: options.scrapedAt,
        is_new: options.isNew,
        source_url: `${listingPageUrl}#myModal${tender.idCompra}`,
    };
}
