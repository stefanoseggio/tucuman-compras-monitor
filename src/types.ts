/** `estado_compra` query param on the portal: 1 = upcoming opening, 2 = in adjudication, 3 = awarded. */
export type EstadoCompra = '1' | '2' | '3';

/** Delta-mode date window, matched against a tender's own fechaAperturaSobres - see delta.ts. */
export type DateRange = '24h' | '7d' | '30d';

export interface ActorInput {
    estados: EstadoCompra[];
    maxItems: number;
    /**
     * Delta mode: return only tenders not returned by a previous run (see src/state.ts).
     * Implemented as a post-fetch filter, not early-stop pagination - see AGENTS.md for the
     * live evidence that this portal's listing order is not reliable enough for early-stop.
     */
    onlyNew: boolean;
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

export interface ParsedTender extends ListingCardFields, ModalDetailFields {}

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
    event_type: string;
    scraped_at: string;
    is_new: boolean;
    source_url: string;
}

/** The actual shape pushed to the dataset: a TenderRecord with the envelope fields applied. */
export type TenderOutputRecord = Omit<TenderRecord, 'scrapedAt' | 'listingPageUrl'> & DeltaEnvelopeFields;
