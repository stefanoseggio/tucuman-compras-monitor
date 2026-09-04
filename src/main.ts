import { Actor, log } from 'apify';

import { fetchTenders } from './fetchListing.js';
import type { ActorInput } from './types.js';

const RESULT_EVENT_NAME = 'result';

await Actor.init();
await run();
await Actor.exit();

async function run(): Promise<void> {
    const input = (await Actor.getInput<ActorInput>()) ?? ({} as ActorInput);
    const { estados = ['1'], maxItems = 100 } = input;

    const tenders = await fetchTenders(estados, maxItems);
    log.info(`Total tenders extraidos: ${tenders.length}`);

    let pushed = 0;
    for (const tender of tenders) {
        await Actor.pushData(tender);
        pushed += 1;

        const { eventChargeLimitReached } = await Actor.charge({ eventName: RESULT_EVENT_NAME, count: 1 });
        if (eventChargeLimitReached) {
            log.info('Charge limit reached - stopping.');
            return;
        }
    }

    log.info(`Cargados ${pushed} items al dataset.`);
}
