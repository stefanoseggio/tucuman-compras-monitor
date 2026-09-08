import type { ParsedListingPage } from '../types.js';
/**
 * Parses one listing page (`ver_llamados_compras_avanzado.php?estado_compra=N&pagina_actual=N`).
 * Everything a tender has to offer - including the full multi-renglon breakdown and the
 * pliego PDF link - is already inline in this one response, in the tender's own Bootstrap
 * modal (`#myModal{idCompra}`). No separate detail request is needed or exists usably -
 * see AGENTS.md for what the audit notes got wrong about this.
 */
export declare function parseListingPage(html: string, pageUrl: string): ParsedListingPage;
//# sourceMappingURL=listing.d.ts.map