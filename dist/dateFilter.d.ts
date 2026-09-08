import type { DateRange } from './types.js';
/**
 * Parses one of the portal's own date strings into a Date, or returns null for anything
 * that doesn't match (null/empty input, or an unexpected shape) - callers should treat a
 * null result as "cannot verify the date window, so exclude rather than guess", never throw.
 */
export declare function parseSourceDate(value: string | null | undefined): Date | null;
/**
 * True when `date` falls within the last `range` (a backward-looking window ending at `now`,
 * e.g. "24h" = (now - 24h, now]). A future `date` (later than `now`) is NEVER within range -
 * see the estado-1 caveat in AGENTS.md/README.md: upcoming tenders' fechaAperturaSobres is a
 * scheduled FUTURE date, so this filter has no matches there by design, not by bug.
 */
export declare function isWithinDateRange(date: Date, range: DateRange, now: Date): boolean;
//# sourceMappingURL=dateFilter.d.ts.map