import { log } from 'apify';
import { fetchHtmlWithRetry } from './http.js';
import { parseListingPage } from './parsers/listing.js';
const BASE_URL = 'https://comprasbys.tucuman.gob.ar/ver_llamados_compras_avanzado.php';
// Verified live 2026-09-04: every page fetched (estado 1, 2 and 3, first/middle/last
// pages) returned exactly 5 tenders, except the genuinely-last page of each estado's
// results, which returned the true remainder (e.g. 31 total -> 6 full pages + 1).
const PAGE_SIZE = 5;
export const ESTADO_LABELS = {
    '1': 'Apertura proxima',
    '2': 'En proceso de adjudicacion',
    '3': 'Adjudicada',
};
function buildListingUrl(estado, pagina) {
    return `${BASE_URL}?n=1&pagina_actual=${pagina}&estado_compra=${estado}`;
}
export async function fetchTenders(estados, maxItems) {
    const results = [];
    for (const estado of estados) {
        if (results.length >= maxItems)
            break;
        let totalPages = 1;
        for (let pagina = 1; pagina <= totalPages; pagina++) {
            if (results.length >= maxItems)
                break;
            const url = buildListingUrl(estado, pagina);
            let parsed;
            try {
                const html = await fetchHtmlWithRetry(url);
                parsed = parseListingPage(html, url);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                log.warning(`estado=${estado} pagina=${pagina}: fallo tras reintentos (${message}) - deteniendo esta serie.`);
                break;
            }
            if (pagina === 1) {
                totalPages = Math.max(1, Math.ceil(parsed.numTotal / PAGE_SIZE));
                log.info(`estado=${estado}: num_total=${parsed.numTotal} (${totalPages} paginas de ${PAGE_SIZE}).`);
            }
            if (parsed.items.length === 0) {
                log.info(`estado=${estado} pagina=${pagina}: 0 tenders - deteniendo esta serie.`);
                break;
            }
            const scrapedAt = new Date().toISOString();
            for (const item of parsed.items) {
                if (results.length >= maxItems)
                    break;
                results.push({
                    ...item,
                    estadoCompra: estado,
                    estadoCompraLabel: ESTADO_LABELS[estado],
                    listingPageUrl: url,
                    scrapedAt,
                });
            }
        }
    }
    return results;
}
//# sourceMappingURL=fetchListing.js.map