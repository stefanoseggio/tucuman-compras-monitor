/** `estado_compra` query param on the portal: 1 = upcoming opening, 2 = in adjudication, 3 = awarded. */
export type EstadoCompra = '1' | '2' | '3';
/** Delta-mode date window, matched against a tender's own fechaAperturaSobres - see delta.ts. */
export type DateRange = '24h' | '7d' | '30d';
/**
 * NEW_LISTING: id never seen before. STATUS_CHANGE: id seen before, under a DIFFERENT
 * estado_compra (a real lifecycle transition, e.g. 1 -> 3). UPDATED: id seen before, same
 * estado, but its content fingerprint changed (an amendment - new monto, new renglon, a
 * corrected date). UNCHANGED: id seen before, same estado, same fingerprint - only ever
 * produced on a full (onlyNew=false) run; onlyNew=true always excludes it. See src/delta.ts
 * and AGENTS.md "Delta engine v2".
 */
export type EventType = 'NEW_LISTING' | 'STATUS_CHANGE' | 'UPDATED' | 'UNCHANGED';
export interface ActorInput {
    estados: EstadoCompra[];
    maxItems: number;
    /**
     * Delta mode: return only tenders that are new, changed estado or amended since a
     * previous run (see src/state.ts). Implemented as a post-fetch filter, not early-stop
     * pagination - see AGENTS.md for the live evidence that this portal's listing order is
     * not reliable enough for early-stop.
     */
    onlyNew: boolean;
    /** Which event types to deliver when onlyNew=true. Ignored (everything is delivered) when onlyNew=false. */
    eventTypes?: Exclude<EventType, 'UNCHANGED'>[];
    /**
     * Filters to tenders whose fechaAperturaSobres falls within the last 24h/7d/30d.
     * Independent of onlyNew. See README.md "Delta mode" for the estado-1 caveat (that date
     * is always in the future for upcoming tenders, so it never matches this backward window).
     */
    dateRange?: DateRange;
}
/** One line item ("renglon") from a tender's full breakdown table, as published inside its detail modal. */
export interface RenglonDetalle {
    renglon: string;
    descripcion: string;
}
/**
 * Fields scraped from a tender's listing "card" (the div.table/fondo_gris block).
 * Present for every tender, on every estado_compra, verified live across 1 (31 items),
 * 2 (3707 items) and 3 (313 items) - see AGENTS.md.
 */
export interface ListingCardFields {
    idCompra: string;
    reparticion: string;
    tipoCompra: string;
    valorPliego: string;
    numeroExpediente: string;
    rubro: string;
    primerRenglon: string;
    fechaAperturaSobres: string | null;
    fechaAdjudicacion: string | null;
}
/**
 * Fields scraped from a tender's own Bootstrap modal (`#myModal{idCompra}`), which is
 * embedded inline in the same listing HTML response - no separate detail request needed.
 */
export interface ModalDetailFields {
    numeroConvocatoria: string | null;
    autorizadoPor: string | null;
    presupuestoOficial: string | null;
    garantiaOfertaExigida: string | null;
    lugarApertura: string | null;
    informesAdquisicionPliegos: string | null;
    objetoLibre: string | null;
    renglones: RenglonDetalle[];
    pliegoPdfUrl: string | null;
}
export interface ParsedTender extends ListingCardFields, ModalDetailFields {
}
export interface ParsedListingPage {
    numTotal: number;
    items: ParsedTender[];
}
export interface TenderRecord extends ParsedTender {
    estadoCompra: EstadoCompra;
    estadoCompraLabel: string;
    listingPageUrl: string;
    scrapedAt: string;
}
/**
 * The 5 standardized delta-engine fields every pushed record carries - see src/envelope.ts.
 * `scraped_at` replaces the per-page `scrapedAt` above and `source_url` replaces
 * `listingPageUrl` (dropped from the final output in favor of this more specific field) -
 * both are semantically the same information, just standardized/renamed, so the old names
 * are not kept alongside the new ones.
 */
export interface DeltaEnvelopeFields {
    record_id: string;
    event_type: EventType;
    scraped_at: string;
    is_new: boolean;
    source_url: string;
    /** Set only for event_type=STATUS_CHANGE: the estado_compra this id was last seen under. */
    previousEstado: EstadoCompra | null;
    /** sha1 content fingerprint as of this run - see src/fingerprint.ts. */
    contentHash: string;
}
/** The actual shape pushed to the dataset: a TenderRecord with the envelope fields applied. */
export type TenderOutputRecord = Omit<TenderRecord, 'scrapedAt' | 'listingPageUrl'> & DeltaEnvelopeFields;
//# sourceMappingURL=types.d.ts.map