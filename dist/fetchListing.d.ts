import type { EstadoCompra, TenderRecord } from './types.js';
export declare const ESTADO_LABELS: Record<EstadoCompra, string>;
export declare function fetchTenders(estados: EstadoCompra[], maxItems: number): Promise<TenderRecord[]>;
//# sourceMappingURL=fetchListing.d.ts.map