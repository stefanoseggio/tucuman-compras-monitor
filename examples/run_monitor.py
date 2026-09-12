# run_monitor.py
# Runs the Tucuman Compras Monitor actor and prints delivered tender records.
import os
from apify_client import ApifyClient

# Authenticate using a token from the environment (never hardcode it).
client = ApifyClient(os.environ["APIFY_TOKEN"])

# Realistic minimal input: delta mode over upcoming + in-adjudication tenders.
run_input = {
    "estados": ["1", "2"],
    "maxItems": 50,
    "onlyNew": True,
    "eventTypes": ["NEW_LISTING", "STATUS_CHANGE", "UPDATED"],
}

print("Starting tucuman-compras-monitor run...")
# Actor ID TdJtze8dfyykMj2qA — call() starts the run and waits for it to finish.
run = client.actor("TdJtze8dfyykMj2qA").call(run_input=run_input)

print(f"Run finished with status: {run['status']}")

# Pull the resulting tender records from the run's default dataset.
dataset_items = client.dataset(run["defaultDatasetId"]).list_items().items

print(f"Fetched {len(dataset_items)} tender record(s):")
for item in dataset_items:
    print(
        f"- [{item['event_type']}] {item['idCompra']} | "
        f"{item['reparticion']} | {item['tipoCompra']} | "
        f"apertura: {item['fechaAperturaSobres']}"
    )
