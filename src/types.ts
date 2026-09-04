/** `estado_compra` query param on the portal: 1 = upcoming opening, 2 = in adjudication, 3 = awarded. */
export type EstadoCompra = '1' | '2' | '3';

export interface ActorInput {
    estados: EstadoCompra[];
    maxItems: number;
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
