import { describe, expect, it } from 'vitest';

import { isWithinDateRange, parseSourceDate } from '../src/dateFilter.js';

describe('parseSourceDate', () => {
    // Tucuman is a fixed UTC-3, no DST since 2009 (see SITE_UTC_OFFSET_MINUTES in
    // src/dateFilter.ts) - the portal's wall-clock string is always 3h behind UTC,
    // regardless of the runtime's own timezone.
    it('parses the portal\'s "DD/MM/YYYY, HH:MM:SS" format (real fechaAperturaSobres value)', () => {
        const date = parseSourceDate('10/09/2026, 12:30:00');
        expect(date).not.toBeNull();
        expect(date!.toISOString()).toBe('2026-09-10T15:30:00.000Z');
    });

    it('parses the portal\'s date-only "DD/MM/YYYY" format (real fechaAdjudicacion value)', () => {
        const date = parseSourceDate('08/11/2023');
        expect(date).not.toBeNull();
        expect(date!.toISOString()).toBe('2023-11-08T03:00:00.000Z');
    });

    it('returns null for null, undefined and empty input rather than throwing', () => {
        expect(parseSourceDate(null)).toBeNull();
        expect(parseSourceDate(undefined)).toBeNull();
        expect(parseSourceDate('')).toBeNull();
    });

    it('returns null for a value that does not match the expected shape', () => {
        expect(parseSourceDate('not a date')).toBeNull();
        expect(parseSourceDate('2026-09-10')).toBeNull(); // ISO shape, not the portal's own shape
    });
});

describe('isWithinDateRange', () => {
    const now = new Date('2026-09-06T12:00:00');

    it('is true for a date 14 hours ago within a 24h window', () => {
        const date = new Date('2026-09-05T22:00:00');
        expect(isWithinDateRange(date, '24h', now)).toBe(true);
    });

    it('is false for a date 3 days ago against a 24h window, true against 7d', () => {
        const date = new Date('2026-09-03T12:00:00');
        expect(isWithinDateRange(date, '24h', now)).toBe(false);
        expect(isWithinDateRange(date, '7d', now)).toBe(true);
    });

    it('is false for a date 40 days ago against a 30d window', () => {
        const date = new Date('2026-07-28T12:00:00');
        expect(isWithinDateRange(date, '30d', now)).toBe(false);
    });

    it('is ALWAYS false for a future date, regardless of window - the estado-1 gotcha', () => {
        // Upcoming tenders' fechaAperturaSobres is a scheduled FUTURE date - a backward-looking
        // window must never treat "hasn't happened yet" as "happened recently". See AGENTS.md.
        const future = new Date('2026-09-10T12:30:00');
        expect(isWithinDateRange(future, '24h', now)).toBe(false);
        expect(isWithinDateRange(future, '7d', now)).toBe(false);
        expect(isWithinDateRange(future, '30d', now)).toBe(false);
    });
});
