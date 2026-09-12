// run-monitor.js
// Runs the Tucuman Compras Monitor actor and logs delivered tender records.
const { ApifyClient } = require('apify-client');

// Authenticate using a token from the environment (never hardcode it).
const client = new ApifyClient({
    token: process.env.APIFY_TOKEN,
});

async function main() {
    // Realistic minimal input: delta mode over upcoming + in-adjudication tenders.
    const input = {
        estados: ['1', '2'],
        maxItems: 50,
        onlyNew: true,
        eventTypes: ['NEW_LISTING', 'STATUS_CHANGE', 'UPDATED'],
    };

    console.log('Starting tucuman-compras-monitor run...');
    // Actor ID TdJtze8dfyykMj2qA — call() starts the run and waits for it to finish.
    const run = await client.actor('TdJtze8dfyykMj2qA').call(input);

    console.log(`Run finished with status: ${run.status}`);

    // Pull the resulting tender records from the run's default dataset.
    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    console.log(`Fetched ${items.length} tender record(s):`);
    for (const item of items) {
        console.log(
            `- [${item.event_type}] ${item.idCompra} | ${item.reparticion} | ` +
            `${item.tipoCompra} | apertura: ${item.fechaAperturaSobres}`
        );
    }
}

main().catch((err) => {
    console.error('Run failed:', err.message);
    process.exit(1);
});
