import type { DateRange } from './types.js';

const RANGE_MS: Record<DateRange, number> = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
};

// The portal renders its own dates as "DD/MM/YYYY, HH:MM:SS" (fechaAperturaSobres, e.g.
// "10/09/2026, 12:30:00") or occasionally date-only "DD/MM/YYYY" (fechaAdjudicacion, e.g.
// "08/11/2023") - verified against real fixtures and a live fetch on 2026-09-06. Built with
// new Date(y, m, d, ...) (local-time constructor) rather than parsing/relying on any implied
// UTC offset, since the site does not publish a timezone and Node's Date(string) parsing of
// non-ISO formats is implementation-defined.
const DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})(?:,\s*(\d{2}):(\d{2}):(\d{2}))?$/;

/**
 * Parses one of the portal's own date strings into a Date, or returns null for anything
 * that doesn't match (null/empty input, or an unexpected shape) - callers should treat a
 * null result as "cannot verify the date window, so exclude rather than guess", never throw.
 */
export function parseSourceDate(value: string | null | undefined): Date | null {
    if (!value) return null;
    const match = DATE_PATTERN.exec(value.trim());
    if (!match) return null;

    const [, dd, mm, yyyy, hh = '00', min = '00', ss = '00'] = match;
    const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(ss));
    return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * True when `date` falls within the last `range` (a backward-looking window ending at `now`,
 * e.g. "24h" = (now - 24h, now]). A future `date` (later than `now`) is NEVER within range -
 * see the estado-1 caveat in AGENTS.md/README.md: upcoming tenders' fechaAperturaSobres is a
 * scheduled FUTURE date, so this filter has no matches there by design, not by bug.
 */
export function isWithinDateRange(date: Date, range: DateRange, now: Date): boolean {
    const ageMs = now.getTime() - date.getTime();
    return ageMs >= 0 && ageMs <= RANGE_MS[range];
}
