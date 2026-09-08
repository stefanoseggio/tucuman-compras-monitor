import { createHash } from 'node:crypto';

import type { ParsedTender } from './types.js';

/**
 * A stable content fingerprint of everything about a tender that can change while it stays
 * in the same estado_compra - montos, dates, the modal's full field set, renglones. Excludes
 * idCompra/estadoCompra (identity, not content) and anything this actor itself stamps
 * (scrapedAt, listingPageUrl). Used to detect UPDATED (amendment within the same estado)
 * without a second HTTP request - unlike sibling actors that fingerprint a separate detail
 * page, every field here is already present in the one listing fetch this actor always makes.
 */
export function fingerprintOf(tender: ParsedTender): string {
    const stable = {
        reparticion: tender.reparticion,
        tipoCompra: tender.tipoCompra,
        valorPliego: tender.valorPliego,
        numeroExpediente: tender.numeroExpediente,
        rubro: tender.rubro,
        primerRenglon: tender.primerRenglon,
        fechaAperturaSobres: tender.fechaAperturaSobres,
        fechaAdjudicacion: tender.fechaAdjudicacion,
        numeroConvocatoria: tender.numeroConvocatoria,
        autorizadoPor: tender.autorizadoPor,
        presupuestoOficial: tender.presupuestoOficial,
        garantiaOfertaExigida: tender.garantiaOfertaExigida,
        lugarApertura: tender.lugarApertura,
        informesAdquisicionPliegos: tender.informesAdquisicionPliegos,
        objetoLibre: tender.objetoLibre,
        renglones: tender.renglones,
        pliegoPdfUrl: tender.pliegoPdfUrl,
    };
    return createHash('sha1').update(JSON.stringify(stable)).digest('hex');
}
