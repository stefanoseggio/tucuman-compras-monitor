import { Actor, log } from 'apify';

import { applyDelta } from './delta.js';
import { fetchTenders } from './fetchListing.js';
import { loadDeltaState, mergeSeen, saveDeltaState } from './state.js';
import type { ActorInput, EstadoCompra } from './types.js';

// Every pushed record already carries its full modal-level detail inline (see AGENTS.md
// point 2: this source has no separate detail request to skip), so there is no natural
// result/result-summary split the way sibling actors have one - a single event, priced for
// full detail every time, is the honest mapping rather than an invented cheap tier.
const RESULT_EVENT_NAME = 'result';

await Actor.init();
try {
    await run();
} catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.exception(error instanceof Error ? error : new Error(message), 'Run failed');
    await Actor.setValue('LAST_ERROR', { message, at: new Date().toISOString() });
    await Actor.fail(`Tucuman public tenders extraction failed: ${message}`);
}
await Actor.exit();

async function run(): Promise<void> {
    const input = (await Actor.getInput<ActorInput>()) ?? ({} as ActorInput);
    const { estados = ['1'], maxItems = 100, onlyNew = false, eventTypes, dateRange } = input;

    const tenders = await fetchTenders(estados, maxItems);
    log.info(`Total tenders extraidos: ${tenders.length}`);

    const state = await loadDeltaState();
    log.info(`Delta state: ${state.order.length} known id(s) across all estados.`);

    const scrapedAt = new Date().toISOString();
    const { output } = applyDelta({ tenders, state, onlyNew, eventTypes, dateRange, scrapedAt, now: new Date() });

    if (onlyNew || dateRange) {
        log.info(
            `Delta filters (onlyNew=${onlyNew}, dateRange=${dateRange ?? 'none'}): ${output.length} of ${tenders.length} tenders pass.`,
        );
    }

    // Only records actually pushed this run are recorded as "seen" - a tender dateRange,
    // eventTypes or the charge limit excludes today must still be reported as changed on a
    // later run that does not exclude it, not silently marked seen.
    const observed: { id: string; estado: EstadoCompra; hash: string }[] = [];
    let pushed = 0;
    const byEventType: Record<string, number> = {};

    for (const record of output) {
        await Actor.pushData(record);
        pushed += 1;
        byEventType[record.event_type] = (byEventType[record.event_type] ?? 0) + 1;
        observed.push({ id: record.record_id, estado: record.estadoCompra, hash: record.contentHash });

        const { eventChargeLimitReached } = await Actor.charge({ eventName: RESULT_EVENT_NAME, count: 1 });
        if (eventChargeLimitReached) {
            log.info('Charge limit reached - stopping.');
            break;
        }
    }

    const nextState = mergeSeen(state, observed);
    await saveDeltaState(nextState);

    log.info(
        `Cargados ${pushed} items al dataset (${Object.entries(byEventType)
            .map(([type, count]) => `${type}=${count}`)
            .join(', ')}).`,
    );
}
