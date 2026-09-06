# Tucuman Compras Monitor

Extracts **public tenders** (Licitaciones Publicas, Licitaciones Privadas,
Concursos de Precios, Contrataciones Directas) from the Province of
Tucuman, Argentina's official procurement portal - full multi-renglon line
item breakdown, montos, lugar/fecha de apertura and a direct pliego PDF
link, all from a single request per page of results (no separate detail
page fetch exists or is needed - see `AGENTS.md`).

## Delta mode

Built for daily/recurring B2B monitoring, not just a one-off static dump.
Set `onlyNew: true` and each scheduled run returns only the tenders your
last run hasn't already returned - the actor tracks seen ids per
`estado_compra` in its own named key-value store
(`tucuman-compras-monitor-delta-state`), so state survives between runs
even though each run's own default dataset/key-value store does not.
Every record also always carries `is_new` (true/false, computed even on a
plain non-delta run) so you can tell which of a full run's results are
actually fresh.

Add `dateRange: "24h" | "7d" | "30d"` (independent of `onlyNew`) to filter
to tenders whose `fechaAperturaSobres` (bid-opening date) falls in that
window. **Real gotcha**: for `estado_compra=1` (apertura proxima) that
date is always in the future - the opening hasn't happened yet - so
`dateRange` never matches anything there by design; it is genuinely
useful for estado 2/3, whose opening date is already in the past. See
`AGENTS.md` for the live evidence and the full reasoning.

```python
from apify_client import ApifyClient

client = ApifyClient("YOUR_TOKEN")
run = client.actor("stefano_seggio/tucuman-compras-monitor").call(
    run_input={"estados": ["1", "3"], "maxItems": 200, "onlyNew": True}
)
for item in client.dataset(run["defaultDatasetId"]).iterate_items():
    print(item["record_id"], item["event_type"], item["is_new"])
```

```javascript
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: 'YOUR_TOKEN' });
const run = await client
    .actor('stefano_seggio/tucuman-compras-monitor')
    .call({ estados: ['1', '3'], maxItems: 200, onlyNew: true });
const { items } = await client.dataset(run.defaultDatasetId).listItems();
```

For wiring new results into Slack/Zapier/Make/a custom endpoint on every
run, use Apify's native
[dataset webhooks](https://docs.apify.com/platform/integrations/webhooks)
rather than anything built into this actor - keeping the actor itself
free of outbound-notification code is a deliberate "ultra-light"
architecture choice, not an oversight.

## What you get

| Field                                | Description                                                              |
| ------------------------------------ | ------------------------------------------------------------------------ |
| `idCompra`                           | Tender ID                                                                |
| `estadoCompra` / `estadoCompraLabel` | `1`/`2`/`3` and its label (upcoming, in adjudication, awarded)           |
| `reparticion`                        | Buying organism                                                          |
| `tipoCompra`                         | e.g. "LICITACION PUBLICA", "CONCURSO DE PRECIOS", "CONTRATACION DIRECTA" |
| `rubro`                              | Category                                                                 |
| `numeroExpediente`                   | File number                                                              |
| `numeroConvocatoria`                 | Human-readable call number, e.g. "CONCURSO DE PRECIOS Nº 012/2026"       |
| `primerRenglon`                      | First line item, as shown on the listing card                            |
| `renglones`                          | Full line-item breakdown: `{renglon, descripcion}[]` (can be 1-4+ items) |
| `valorPliego`                        | Bid document price                                                       |
| `presupuestoOficial`                 | Official budget, when published                                          |
| `garantiaOfertaExigida`              | Required bid bond, when published                                        |
| `fechaAperturaSobres`                | Bid-opening date/time                                                    |
| `fechaAdjudicacion`                  | Award date (populated only for awarded tenders)                          |
| `lugarApertura`                      | Bid-opening location                                                     |
| `informesAdquisicionPliegos`         | Where to get more info / buy the pliego                                  |
| `autorizadoPor`                      | Authorizing resolution, when published                                   |
| `objetoLibre`                        | Free-text note, when the organism added one                              |
| `pliegoPdfUrl`                       | Direct downloadable pliego PDF, when linked                              |
| `record_id`                          | Standardized envelope: same value as `idCompra`                          |
| `event_type`                         | Standardized envelope: `NEW_LISTING` for every record - see `AGENTS.md`  |
| `scraped_at`                         | Standardized envelope: ISO timestamp, same for every record in one run   |
| `is_new`                             | Standardized envelope: true if not returned by a previous run            |
| `source_url`                         | Standardized envelope: listing page URL + this record's own modal anchor |

## Input

| Field       | Type    | Default  | Description                                                                                                                |
| ----------- | ------- | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| `estados`   | array   | `["1"]`  | Which states to fetch: `1` (apertura proxima), `2` (en adjudicacion), `3` (adjudicadas)                                    |
| `maxItems`  | integer | `100`    | Hard cap on tenders returned this run, across all selected states                                                          |
| `onlyNew`   | boolean | `false`  | Delta mode: only tenders not returned by a previous run - see "Delta mode" above                                           |
| `dateRange` | string  | _(none)_ | `"24h"` / `"7d"` / `"30d"` - filters to tenders whose `fechaAperturaSobres` falls in that window, independent of `onlyNew` |

```json
{ "estados": ["1"], "maxItems": 100 }
```

## Usage

```bash
curl "https://api.apify.com/v2/acts/stefano_seggio~tucuman-compras-monitor/run-sync-get-dataset-items?token=YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"estados": ["1"], "maxItems": 100}'
```

```python
from apify_client import ApifyClient

client = ApifyClient("YOUR_TOKEN")
run = client.actor("stefano_seggio/tucuman-compras-monitor").call(run_input={"estados": ["1"], "maxItems": 100})
for item in client.dataset(run["defaultDatasetId"]).iterate_items():
    print(item["idCompra"], item["reparticion"], item["primerRenglon"])
```

```javascript
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: 'YOUR_TOKEN' });
const run = await client.actor('stefano_seggio/tucuman-compras-monitor').call({ estados: ['1'], maxItems: 100 });
const { items } = await client.dataset(run.defaultDatasetId).listItems();
```

## Known limitations

- No proxy needed - the source is reachable from a plain datacenter IP.
- `estado_compra=2` (en adjudicacion) has a very large backlog (3700+
  tenders live) - raising `maxItems` a lot for that state means a lot of
  sequential requests (5 tenders per page). Start small.
- `fechaAdjudicacion` is `null` for the large majority of tenders - it is
  only populated once a tender has actually been awarded (estado 3).
- At least one live tender was found with a genuinely truncated field
  value on the government's own portal (not a scraping artifact) - see
  `AGENTS.md` for the confirmed example.
- `onlyNew` is a post-fetch filter, not early-stop pagination - this
  portal's own listing order was verified live to track each tender's
  opening date, not when it was added to the site, so it cannot safely
  support stopping pagination early. See `AGENTS.md`.
- No field-level diffing/UPDATE detection between runs - `event_type` is
  always `NEW_LISTING`; a tender that has moved to a different
  `estado_compra` since your last run is reported again as new under its
  new estado (see `AGENTS.md`), not flagged as a state-transition event.

Full technical detail, including what an earlier audit pass got wrong
about this target and how it was corrected by live re-verification, is in
`AGENTS.md`.
