# Tucuman Tenders Scraper & Monitor

**The tender-alert feed the Province of Tucuman never shipped.** Extracts every public tender (Licitacion Publica, Licitacion Privada, Concurso de Precios, Contratacion Directa) from the Province of Tucuman, Argentina's official procurement portal (`comprasbys.tucuman.gob.ar`) - full multi-renglon line-item breakdown, montos, lugar/fecha de apertura and a direct pliego PDF link, all from a single request per page of results (no separate detail-page fetch exists or is needed - see `AGENTS.md`) - and keeps it fresh with a delta mode that tells you what is genuinely **new, moved to a different stage of its lifecycle, or amended** since your last run.

[![Tucuman Tenders Scraper & Monitor](https://apify.com/actor-badge?actor=stefano_seggio/tucuman-compras-monitor)](https://apify.com/stefano_seggio/tucuman-compras-monitor)

- **See a real lifecycle, not just a snapshot.** Every tender moves through three states - `apertura proxima` (upcoming opening) -> `en adjudicacion` (in adjudication) -> `adjudicada` (awarded). This actor's delta engine tracks each `idCompra` across all three, so a tender reaching a new stage is reported as `STATUS_CHANGE`, not a duplicate "new" listing.
- **Catches amendments the listing never shows.** A changed monto, a corrected opening date or an added renglon is fingerprinted from the tender's own already-fetched data and reported as `UPDATED` - at zero extra HTTP requests, because every field is already inline in the one listing fetch this actor always makes.
- **Full detail, one request per 5 tenders.** No detail page, no proxy, no browser - just a plain read-only GET against the portal's own listing endpoint.

## Who uses Tucuman procurement data

| Team | Question they ask | Fields that answer it | Decision |
| --- | --- | --- | --- |
| Suppliers to provincial ministries and organisms (construction, IT, security, health, general services) | Who is buying what I sell, at what budget, and did the opening date move? | `reparticion`, `rubro`, `presupuestoOficial`, `fechaAperturaSobres`, `event_type=UPDATED` | Bid/no-bid, re-check the offer before the deadline |
| Bid consultants and gestores managing several clients | Did any client's tracked tender get awarded or amended since yesterday? | `event_type=STATUS_CHANGE`/`UPDATED`, `previousEstado`, `pliegoPdfUrl` | Notify the client, pull the updated pliego |
| Regional tender-data resellers / LATAM procurement platforms | A structured, change-aware Tucuman feed instead of a screen scrape | The whole envelope (`record_id`, `event_type`, `scraped_at`, `is_new`, `source_url`) | Buy vs. build one of dozens of provincial scrapers |
| Journalists, researchers, transparency groups | Which organisms award the most, and to which type of process? | `tipoCompra`, `reparticion`, `estadoCompraLabel`, `fechaAdjudicacion` | Spending-pattern analysis by organism and process type |

## Delta mode

Set `onlyNew: true` for recurring/scheduled monitoring and each run returns only tenders that are `NEW_LISTING` (never seen before), `STATUS_CHANGE` (moved to a different estado_compra - a real lifecycle transition) or `UPDATED` (amended within the same estado - a changed monto, renglon, date or other field). State is tracked cross-estado, per `idCompra`, in this actor's own named key-value store (`tucuman-compras-monitor-delta-state`), so it survives between scheduled runs even though each run's own default key-value store does not. `eventTypes` narrows which of the three you want delivered. Every record also always carries `is_new` (computed even on a plain non-delta run).

Add `dateRange: "24h" | "7d" | "30d"` (independent of `onlyNew`) to filter to tenders whose `fechaAperturaSobres` (bid-opening date) falls in that window. **Real gotcha**: for `estado_compra=1` (apertura proxima) that date is always in the future - the opening hasn't happened yet - so `dateRange` never matches anything there by design; it is genuinely useful for estado 2/3, whose opening date is already in the past. See `AGENTS.md` for the live evidence and the full reasoning.

```python
from apify_client import ApifyClient

client = ApifyClient("YOUR_TOKEN")
run = client.actor("stefano_seggio/tucuman-compras-monitor").call(
    run_input={"estados": ["1", "2", "3"], "maxItems": 200, "onlyNew": True}
)
for item in client.dataset(run["defaultDatasetId"]).iterate_items():
    print(item["record_id"], item["event_type"], item["previousEstado"], item["is_new"])
```

```javascript
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: 'YOUR_TOKEN' });
const run = await client
    .actor('stefano_seggio/tucuman-compras-monitor')
    .call({ estados: ['1', '2', '3'], maxItems: 200, onlyNew: true });
const { items } = await client.dataset(run.defaultDatasetId).listItems();
```

```bash
curl "https://api.apify.com/v2/acts/stefano_seggio~tucuman-compras-monitor/run-sync-get-dataset-items?token=YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"estados": ["1"], "maxItems": 100, "onlyNew": true}'
```

For wiring new results into Slack/Zapier/Make/a custom endpoint on every run, use Apify's native [dataset webhooks](https://docs.apify.com/platform/integrations/webhooks) rather than anything built into this actor - keeping the actor itself free of outbound-notification code is a deliberate "ultra-light" architecture choice, not an oversight.

## What you get

| Field | Description |
| --- | --- |
| `idCompra` | Tender ID |
| `estadoCompra` / `estadoCompraLabel` | `1`/`2`/`3` and its label (upcoming, in adjudication, awarded) |
| `reparticion` | Buying organism |
| `tipoCompra` | e.g. "LICITACION PUBLICA", "CONCURSO DE PRECIOS", "CONTRATACION DIRECTA" |
| `rubro` | Category |
| `numeroExpediente` | File number |
| `numeroConvocatoria` | Human-readable call number, e.g. "CONCURSO DE PRECIOS Nº 012/2026" |
| `primerRenglon` | First line item, as shown on the listing card |
| `renglones` | Full line-item breakdown: `{renglon, descripcion}[]` (can be 1-4+ items) |
| `valorPliego` | Bid document price |
| `presupuestoOficial` | Official budget, when published |
| `garantiaOfertaExigida` | Required bid bond, when published |
| `fechaAperturaSobres` | Bid-opening date/time |
| `fechaAdjudicacion` | Award date (populated only for awarded tenders) |
| `lugarApertura` | Bid-opening location |
| `informesAdquisicionPliegos` | Where to get more info / buy the pliego |
| `autorizadoPor` | Authorizing resolution, when published |
| `objetoLibre` | Free-text note, when the organism added one |
| `pliegoPdfUrl` | Direct downloadable pliego PDF, when linked |
| `record_id` | Standardized envelope: same value as `idCompra` |
| `event_type` | Standardized envelope: `NEW_LISTING` / `STATUS_CHANGE` / `UPDATED` / `UNCHANGED` |
| `previousEstado` | Set only for `STATUS_CHANGE`: the estado_compra this id was last seen under |
| `contentHash` | sha1 fingerprint of the changeable fields, used to detect `UPDATED` |
| `scraped_at` | Standardized envelope: ISO timestamp, same for every record in one run |
| `is_new` | Standardized envelope: true if this id was never returned by any previous run |
| `source_url` | Standardized envelope: listing page URL + this record's own modal anchor |

## Input

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `estados` | array | `["1"]` | Which states to fetch: `1` (apertura proxima), `2` (en adjudicacion), `3` (adjudicadas) |
| `maxItems` | integer | `100` | Hard cap on tenders returned this run, across all selected states |
| `onlyNew` | boolean | `false` | Delta mode: only tenders that are new, status-changed or amended - see "Delta mode" above |
| `eventTypes` | array | all three | Which of `NEW_LISTING`/`STATUS_CHANGE`/`UPDATED` to deliver when `onlyNew` is on |
| `dateRange` | string | _(none)_ | `"24h"` / `"7d"` / `"30d"` - filters to tenders whose `fechaAperturaSobres` falls in that window, independent of `onlyNew` |

```json
{ "estados": ["1", "2"], "maxItems": 100, "onlyNew": true }
```

## How much does it cost to monitor Tucuman tenders?

Pay per event, platform usage included:

| Event | Price | When |
| --- | --- | --- |
| `result` | **$0.003** per record | Every delivered tender - already full detail (renglones, montos, pliego link), one request per 5 tenders regardless |
| Actor start | $0.00005 | Once per run |

Unlike sibling actors on this portfolio, there is no cheaper `result-summary` tier here: every Tucuman record already carries full modal-level detail at identical extraction cost (see AGENTS.md point 2 - the site's only "detail page" is dead, everything lives in the listing response), so a two-tier split would be artificial. A daily monitor of estado 1+3 that finds 3 changes costs about $0.01/day (~$0.30/month); a one-off pull of all 313 awarded tenders costs about $0.94.

## Known limitations

- No proxy needed - the source is reachable from a plain datacenter IP.
- `estado_compra=2` (en adjudicacion) has a very large backlog (3,700+ tenders live) - raising `maxItems` a lot for that state means a lot of sequential requests (5 tenders per page). Start small.
- `fechaAdjudicacion` is `null` for the large majority of tenders - it is only populated once a tender has actually been awarded (estado 3).
- At least one live tender was found with a genuinely truncated field value on the government's own portal (not a scraping artifact) - see `AGENTS.md` for the confirmed example.
- `onlyNew` is a post-fetch filter, not early-stop pagination - this portal's own listing order was verified live to track each tender's opening date, not when it was added to the site, so it cannot safely support stopping pagination early. See `AGENTS.md`.
- `UPDATED` detects a changed fingerprint, not which specific field changed - compare the new record against your last stored copy of the same `idCompra` if you need a field-level diff.
- Deploying this v2.0 delta engine on top of an existing v1 schedule re-baselines: the state shape changed (cross-estado id map, not one seen-set per estado) and the old shape is treated as absent rather than migrated. See CHANGELOG.md.

Full technical detail, including what an earlier audit pass got wrong about this target and how it was corrected by live re-verification, is in `AGENTS.md`.
