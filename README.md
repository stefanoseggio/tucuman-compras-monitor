# Tucuman Compras Monitor

Extracts **public tenders** (Licitaciones Publicas, Licitaciones Privadas,
Concursos de Precios, Contrataciones Directas) from the Province of
Tucuman, Argentina's official procurement portal - full multi-renglon line
item breakdown, montos, lugar/fecha de apertura and a direct pliego PDF
link, all from a single request per page of results (no separate detail
page fetch exists or is needed - see `AGENTS.md`).

## What you get

| Field | Description |
|---|---|
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
| `listingPageUrl` | The exact listing page this record was read from |
| `scrapedAt` | ISO timestamp of extraction |

## Input

| Field | Type | Default | Description |
|---|---|---|---|
| `estados` | array | `["1"]` | Which states to fetch: `1` (apertura proxima), `2` (en adjudicacion), `3` (adjudicadas) |
| `maxItems` | integer | `100` | Hard cap on tenders returned this run, across all selected states |

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

Full technical detail, including what an earlier audit pass got wrong
about this target and how it was corrected by live re-verification, is in
`AGENTS.md`.
