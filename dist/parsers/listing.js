import * as cheerio from 'cheerio';
function normalize(text) {
    return text.replace(/\s+/g, ' ').trim();
}
function textOrNull($el) {
    const text = normalize($el.text());
    return text.length > 0 ? text : null;
}
/**
 * Groups the page's flat, repeated `<div class="column" id="fondo_gris">Label</div>
 * <div class="column">Value</div>` pairs into one map per tender. `id="fondo_gris"` labels
 * are NOT nested one distinct `<div class="table">` per tender in a way DOM-order grouping
 * can trust (the site's HTML is malformed enough that cheerio's forgiving parser does not
 * reproduce the visual nesting - verified live, see AGENTS.md) - "Reparticion:" is the one
 * label confirmed, across every sample fetched, to always be the first field of a new
 * tender, so it is used as the group boundary instead.
 */
function groupCardFields($) {
    const groups = [];
    let current = null;
    $('[id="fondo_gris"]').each((_i, el) => {
        const $label = $(el);
        const label = normalize($label.text());
        const $value = $label.next();
        const value = normalize($value.text());
        if (/^Repartici/i.test(label)) {
            current = new Map();
            groups.push(current);
        }
        if (!current)
            return; // malformed page before the first Reparticion - defensively skip
        // A tender can only show one "Renglon N X" preview on the card in every sample seen,
        // but if the site ever prints more than one, keep the first rather than overwrite it.
        if (!current.has(label)) {
            current.set(label, value);
        }
    });
    return groups;
}
function pickField(fields, pattern) {
    for (const [label, value] of fields) {
        if (pattern.test(label))
            return value;
    }
    return '';
}
function pickFieldOrNull(fields, pattern) {
    const value = pickField(fields, pattern);
    return value.length > 0 ? value : null;
}
function parseKvTable($, $modal) {
    const kv = new Map();
    $modal.find('table[width="400"] tr').each((_i, tr) => {
        const tds = $(tr).find('td');
        if (tds.length !== 2)
            return; // 1-td rows are section headers (Montos, Informes, ...) - skip
        const label = normalize($(tds[0]).text());
        const value = normalize($(tds[1]).text());
        if (label.length > 0)
            kv.set(label, value);
    });
    return kv;
}
function parseRenglones($, $modal) {
    const renglones = [];
    const rows = $modal.find('table[border="1"] tr');
    rows.each((i, tr) => {
        if (i === 0)
            return; // header row: RENGLON / DESCRIPCION
        const tds = $(tr).find('td');
        if (tds.length !== 2)
            return;
        const renglon = normalize($(tds[0]).text());
        const descripcion = normalize($(tds[1]).text());
        if (renglon.length > 0)
            renglones.push({ renglon, descripcion });
    });
    return renglones;
}
function parseModalDetail($, $modal, pageUrl) {
    const kv = parseKvTable($, $modal);
    const numeroConvocatoria = textOrNull($modal.find('p[style*="background-color:#CCCCCC"]').first());
    const objetoLibre = textOrNull($modal.find('p[align="justify"]').first());
    const pdfHref = $modal.find('a[href*="a_pdf"]').first().attr('href');
    const pliegoPdfUrl = pdfHref ? new URL(pdfHref, pageUrl).href : null;
    return {
        numeroConvocatoria,
        autorizadoPor: pickFieldOrNull(kv, /^Por:/i),
        presupuestoOficial: pickFieldOrNull(kv, /^Presupuesto oficial/i),
        garantiaOfertaExigida: pickFieldOrNull(kv, /^Garant.a de oferta/i),
        lugarApertura: pickFieldOrNull(kv, /^Lugar/i),
        informesAdquisicionPliegos: pickFieldOrNull(kv, /^Adquisici.n de pliegos/i),
        objetoLibre,
        renglones: parseRenglones($, $modal),
        pliegoPdfUrl,
    };
}
/**
 * Parses one listing page (`ver_llamados_compras_avanzado.php?estado_compra=N&pagina_actual=N`).
 * Everything a tender has to offer - including the full multi-renglon breakdown and the
 * pliego PDF link - is already inline in this one response, in the tender's own Bootstrap
 * modal (`#myModal{idCompra}`). No separate detail request is needed or exists usably -
 * see AGENTS.md for what the audit notes got wrong about this.
 */
export function parseListingPage(html, pageUrl) {
    const $ = cheerio.load(html);
    const numTotalRaw = $('input[name="num_total"]').attr('value');
    const numTotal = numTotalRaw ? parseInt(numTotalRaw, 10) : 0;
    const modals = $('div.modal[id^="myModal"]').toArray();
    const cardGroups = groupCardFields($);
    if (modals.length !== cardGroups.length) {
        throw new Error(`Listing page structure mismatch: found ${modals.length} tender modal(s) but ${cardGroups.length} ` +
            `tender card(s) - the site's HTML shape may have changed. Refusing to guess the pairing. URL: ${pageUrl}`);
    }
    const items = modals.map((modalEl, i) => {
        const idCompra = ($(modalEl).attr('id') ?? '').replace('myModal', '');
        const fields = cardGroups[i];
        const modalDetail = parseModalDetail($, $(modalEl), pageUrl);
        return {
            idCompra,
            reparticion: pickField(fields, /^Repartici/i),
            tipoCompra: pickField(fields, /^Tipo de compra/i),
            valorPliego: pickField(fields, /^Valor del pliego/i),
            numeroExpediente: pickField(fields, /de expediente/i),
            rubro: pickField(fields, /^Rubro/i),
            primerRenglon: pickField(fields, /^Rengl/i),
            fechaAperturaSobres: pickFieldOrNull(fields, /sobres/i),
            fechaAdjudicacion: pickFieldOrNull(fields, /adjudicaci.n:/i),
            ...modalDetail,
        };
    });
    return { numTotal, items };
}
//# sourceMappingURL=listing.js.map