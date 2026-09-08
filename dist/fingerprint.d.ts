import type { ParsedTender } from './types.js';
/**
 * A stable content fingerprint of everything about a tender that can change while it stays
 * in the same estado_compra - montos, dates, the modal's full field set, renglones. Excludes
 * idCompra/estadoCompra (identity, not content) and anything this actor itself stamps
 * (scrapedAt, listingPageUrl). Used to detect UPDATED (amendment within the same estado)
 * without a second HTTP request - unlike sibling actors that fingerprint a separate detail
 * page, every field here is already present in the one listing fetch this actor always makes.
 */
export declare function fingerprintOf(tender: ParsedTender): string;
//# sourceMappingURL=fingerprint.d.ts.map