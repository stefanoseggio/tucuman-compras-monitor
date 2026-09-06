import { Actor, log } from 'apify';

import { applyDelta } from './delta.js';
import { fetchTenders } from './fetchListing.js';
import { getSeenIds, loadDeltaState, mergeSeenIds, saveDeltaState } from './state.js';
import type { ActorInput, EstadoCompra } from './types.js';

const RESULT_EVENT_NAME = 'result';

await Actor.init();
await run();
await Actor.exit();

async function run(): Promise<void> {
    const input = (await Actor.getInput<ActorInput>()) ?? ({} as ActorInput);
    const { estados = ['1'], maxItems = 100, onlyNew = false, dateRange } = input;

    const tenders = await fetchTenders(estados, maxItems);
    log.info(`Total tenders extraidos: ${tenders.length}`);

    // Loaded BEFORE this run's ids are merged in, so is_new reflects "seen in a PRIOR run"
    // even on a plain, non-delta run - see AGENTS.md.
    const deltaState = await loadDeltaState();
    const seenIdsByEstado = new Map<EstadoCompra, Set<string>>(
        estados.map((estado) => [estado, getSeenIds(deltaState, estado)]),
    );

    const scrapedAt = new Date().toISOString();
    const { output } = applyDelta({ tenders, seenIdsByEstado, onlyNew, dateRange, scrapedAt, now: new Date() });

    if (onlyNew || dateRange) {
        log.info(
            `Delta filters (onlyNew=${onlyNew}, dateRange=${dateRange ?? 'none'}): ${output.length} of ${tenders.length} tenders pass.`,
        );
    }

    // Only records actually pushed this run are recorded as "seen" - a tender dateRange
    // excludes today must still show is_new=true on a later run that does not exclude it,
    // and one cut off by the charge limit below must be retried, not silently marked seen.
    const pushedIdsByEstado = new Map<EstadoCompra, string[]>();
    let pushed = 0;

    for (const record of output) {
        await Actor.pushData(record);
        pushed += 1;

        const idsForEstado = pushedIdsByEstado.get(record.estadoCompra) ?? [];
        idsForEstado.push(record.record_id);
        pushedIdsByEstado.set(record.estadoCompra, idsForEstado);

        const { eventChargeLimitReached } = await Actor.charge({ eventName: RESULT_EVENT_NAME, count: 1 });
        if (eventChargeLimitReached) {
            log.info('Charge limit reached - stopping.');
            break;
        }
    }

    for (const [estado, ids] of pushedIdsByEstado) {
        const existing = deltaState.estados[estado]?.seenIds ?? [];
        deltaState.estados[estado] = { seenIds: mergeSeenIds(existing, ids), lastRunAt: scrapedAt };
    }
    await saveDeltaState(deltaState);

    log.info(`Cargados ${pushed} items al dataset.`);
}
