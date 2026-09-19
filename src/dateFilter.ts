import type { DateRange } from './types.js';

const RANGE_MS: Record<DateRange, number> = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
};

// The portal is operated from San Miguel de Tucuman, Argentina. Argentina has used a fixed
// UTC-3 offset (America/Argentina/Tucuman) with no daylight saving since 2009, so a constant
// offset is exact - no Intl/DST machinery needed. Same pattern as sibling santafe-compras-monitor
// (src/normalize.ts SITE_UTC_OFFSET_MINUTES): this must be a fixed constant, NOT the runtime's
// local timezone, because new Date(y, m, d, ...) (the multi-argument, local-time constructor)
// resolves against whatever timezone the process runs in - UTC in the deployed container, not
// Tucuman's - which previously produced a systematic ~3h skew on every dateRange boundary check.
export const SITE_UTC_OFFSET_MINUTES = -3 * 60;

// The portal renders its own dates as "DD/MM/YYYY, HH:MM:SS" (fechaAperturaSobres, e.g.
// "10/09/2026, 12:30:00") or occasionally date-only "DD/MM/YYYY" (fechaAdjudicacion, e.g.
// "08/11/2023") - verified against real fixtures and a live fetch on 2026-09-06.
const DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})(?:,\s*(\d{2}):(\d{2}):(\d{2}))?$/;

/**
 * Parses one of the portal's own date strings into a Date, or returns null for anything
 * that doesn't match (null/empty input, or an unexpected shape) - callers should treat a
 * null result as "cannot verify the date window, so exclude rather than guess", never throw.
 *
 * The string is always Tucuman wall-clock time; it is converted to the correct UTC instant
 * via the fixed SITE_UTC_OFFSET_MINUTES offset (Date.UTC(...) treats the numbers as UTC
 * fields, then subtracting the offset in ms corrects to the real instant), rather than via
 * the local-time Date constructor, so the result is exact regardless of the runtime's own
 * timezone.
 */
export function parseSourceDate(value: string | null | undefined): Date | null {
    if (!value) return null;
    const match = DATE_PATTERN.exec(value.trim());
    if (!match) return null;

    const [, dd, mm, yyyy, hh = '00', min = '00', ss = '00'] = match;
    const utcMillis = Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(ss));
    const date = new Date(utcMillis - SITE_UTC_OFFSET_MINUTES * 60_000);
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
