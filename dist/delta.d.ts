import type { DeltaState } from './state.js';
import type { DateRange, EventType, TenderOutputRecord, TenderRecord } from './types.js';
export interface ApplyDeltaParams {
    tenders: TenderRecord[];
    /** Full delta state as of the START of this run (see src/state.ts). */
    state: DeltaState;
    onlyNew: boolean;
    eventTypes?: Exclude<EventType, 'UNCHANGED'>[];
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
 * event_type is computed for EVERY fetched tender regardless of `onlyNew` (comparing against
 * `state`, a cross-estado id -> {estado, hash} map - see src/state.ts), so a full, non-delta
 * run still tells the consumer exactly what is new, what changed estado, what was amended and
 * what is unchanged. `onlyNew=true` drops UNCHANGED records and anything eventTypes excludes;
 * `onlyNew=false` delivers everything that passes dateRange, UNCHANGED included.
 *
 * main.ts marks a tender "seen" (id + its current estado + hash) only once it is actually
 * pushed to the dataset, so a tender excluded today by dateRange, eventTypes or the charge
 * limit is correctly still reported as changed on a later run that does not exclude it.
 */
export declare function applyDelta(params: ApplyDeltaParams): ApplyDeltaResult;
//# sourceMappingURL=delta.d.ts.map