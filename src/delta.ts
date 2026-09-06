import { isWithinDateRange, parseSourceDate } from './dateFilter.js';
import { buildOutputRecord } from './envelope.js';
import type { DateRange, EstadoCompra, TenderOutputRecord, TenderRecord } from './types.js';

export interface ApplyDeltaParams {
    tenders: TenderRecord[];
    /** Ids already seen per estado_compra, as of the START of this run (see src/state.ts). */
    seenIdsByEstado: Map<EstadoCompra, Set<string>>;
    onlyNew: boolean;
    dateRange?: DateRange;
    /** One shared extraction timestamp for every record from this run. */
    scrapedAt: string;
    /** Injected "now" so dateRange filtering is deterministic in tests - production passes `new Date()`. */
    now: Date;
}

export interface ApplyDeltaResult {
    output: TenderOutputRecord[];
}

/**
 * Applies both delta-mode filters to a fetched batch of tenders and stamps the standardized
 * output envelope. `onlyNew` is a POST-FILTER, not early-stop pagination - see AGENTS.md for
 * the live evidence that this portal's own listing order (sorted by each tender's own
 * opening-date field, not by when it was added to the site) cannot support stopping
 * pagination early without risking silently missing a genuinely new tender on a later page.
 *
 * is_new is computed for every fetched tender regardless of `onlyNew`, so a full,
 * non-delta run still tells the consumer which of its results happen to be new.
 *
 * Only records that pass BOTH filters (or all records, when neither is set) end up in
 * `output` - main.ts marks a tender "seen" for next run only once it is actually pushed to
 * the dataset, so a tender that dateRange excludes today is correctly still "new" on a
 * later run that does not exclude it (see src/main.ts and AGENTS.md).
 */
export function applyDelta(params: ApplyDeltaParams): ApplyDeltaResult {
    const { tenders, seenIdsByEstado, onlyNew, dateRange, scrapedAt, now } = params;

    const output: TenderOutputRecord[] = [];

    for (const tender of tenders) {
        const seenIds = seenIdsByEstado.get(tender.estadoCompra);
        const isNew = !seenIds?.has(tender.idCompra);

        if (onlyNew && !isNew) continue;

        if (dateRange) {
            const date = parseSourceDate(tender.fechaAperturaSobres);
            if (!date || !isWithinDateRange(date, dateRange, now)) continue;
        }

        output.push(buildOutputRecord(tender, { isNew, scrapedAt }));
    }

    return { output };
}
