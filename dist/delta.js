import { isWithinDateRange, parseSourceDate } from './dateFilter.js';
import { buildOutputRecord } from './envelope.js';
import { fingerprintOf } from './fingerprint.js';
import { getSeenEntry } from './state.js';
function classify(entry, tender, hash) {
    if (!entry)
        return 'NEW_LISTING';
    if (entry.estado !== tender.estadoCompra)
        return 'STATUS_CHANGE';
    if (entry.hash !== hash)
        return 'UPDATED';
    return 'UNCHANGED';
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
export function applyDelta(params) {
    const { tenders, state, onlyNew, eventTypes, dateRange, scrapedAt, now } = params;
    const allowedEventTypes = eventTypes ? new Set(eventTypes) : null;
    const output = [];
    for (const tender of tenders) {
        const entry = getSeenEntry(state, tender.idCompra);
        const hash = fingerprintOf(tender);
        const eventType = classify(entry, tender, hash);
        const isNew = !entry;
        if (onlyNew && eventType === 'UNCHANGED')
            continue;
        if (allowedEventTypes && eventType !== 'UNCHANGED' && !allowedEventTypes.has(eventType))
            continue;
        if (dateRange) {
            const date = parseSourceDate(tender.fechaAperturaSobres);
            if (!date || !isWithinDateRange(date, dateRange, now))
                continue;
        }
        output.push(buildOutputRecord(tender, {
            isNew,
            eventType,
            previousEstado: eventType === 'STATUS_CHANGE' && entry ? entry.estado : null,
            contentHash: hash,
            scrapedAt,
        }));
    }
    return { output };
}
//# sourceMappingURL=delta.js.map