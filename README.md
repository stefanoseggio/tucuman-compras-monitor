# Tucuman Government Tenders Monitor - Argentina Public Procurement (Licitaciones)

## Executive Value Proposition

Tucuman's procurement portal (`comprasbys.tucuman.gob.ar`) splits every tender across three separate listings - upcoming, in-adjudication (a backlog of 3,700+ historical records) and awarded - with no way to tell what changed since you last looked. Checking it by hand means re-reading pages of listings on a recurring basis just to spot the one new opening or one amended budget. This actor fetches full multi-renglon detail for every tender - organism, rubro, montos, opening date, pliego PDF - in one pass, and its delta mode tracks each `idCompra` across all three lifecycle stages so a scheduled run tells you only what is genuinely new, moved to a new stage, or was quietly amended.

## Use cases

1. **Suppliers to provincial ministries and organisms** (construction, IT, security, health, general services) - filter on `reparticion` and `rubro` to see who is buying what they sell, check `presupuestoOficial` against their pricing, and get an `UPDATED` event the moment `fechaAperturaSobres` moves before a deadline is missed.
2. **Bid consultants and gestores managing several clients** - run in delta mode and watch for `event_type=STATUS_CHANGE` (a tracked tender reached `adjudicada`) or `UPDATED` (an amendment), using `previousEstado` and `pliegoPdfUrl` to notify the right client and pull the current pliego without re-checking the portal manually.
3. **Journalists, researchers and transparency groups** - aggregate `tipoCompra`, `reparticion`, `estadoCompraLabel` and `fechaAdjudicacion` across runs to study which organisms award the most, through which process type (licitacion publica, privada, concurso de precios, contratacion directa), without hand-copying listings.

## Input

```json
{ "estados": ["1", "2"], "maxItems": 100, "onlyNew": true }
```

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `estados` | array | `["1"]` | Which procurement states to fetch (`estado_compra` on the portal): `1` = apertura proxima (upcoming opening), `2` = en adjudicacion (in adjudication), `3` = adjudicadas (awarded) |
| `maxItems` | integer | `100` | Hard cap on tenders returned this run, across all selected states. The portal lists 5 tenders per page, and `estado_compra=2` alone has 3,700+ historical records, so a high value there means many sequential requests - start small |
| `onlyNew` | boolean | `false` | Delta mode for recurring/scheduled monitoring: returns only tenders that are new, moved to a different `estado_compra`, or amended since a previous run - tracked cross-estado, per `idCompra`, in this actor's own named key-value store so it survives between scheduled runs |
| `eventTypes` | array | all three | Which of `NEW_LISTING` / `STATUS_CHANGE` / `UPDATED` to deliver when `onlyNew` is on |
| `dateRange` | string | _(none)_ | `"24h"` / `"7d"` / `"30d"` - filters to tenders whose `fechaAperturaSobres` falls in that window, independent of `onlyNew`. Note: for `estado_compra=1` this date is always in the future (the opening hasn't happened yet), so it never matches there by design - it filters meaningfully on estados 2/3 |

## Output

One record per tender, with full detail already inline (no separate detail-page fetch exists on this source). Real example, `estado_compra=1`:

```json
{
    "idCompra": "8902",
    "reparticion": "MINISTERIO DE SEGURIDAD - DEPARTAMENTO GENERAL DE POLICIA",
    "tipoCompra": "CONCURSO DE PRECIOS",
    "valorPliego": "Gratuito",
    "numeroExpediente": "3651/208-ADM-2026",
    "rubro": "UTILES DE OFICINA",
    "primerRenglon": "utiles de oficina listado en solicitud de compra obrante en archivo adjunto",
    "fechaAperturaSobres": "09/09/2026, 12:10:00",
    "fechaAdjudicacion": null,
    "numeroConvocatoria": "CONCURSO DE PRECIOS Nº 281-2026",
    "autorizadoPor": null,
    "presupuestoOficial": null,
    "garantiaOfertaExigida": null,
    "lugarApertura": "Direccion de Administración - Oficina Compras y Contrataciones - Calle Italia N° 2601",
    "informesAdquisicionPliegos": "Direccion de Administración - Sección Compras y Contrataciones -Calle Italia N° 2601 hasta fecha 08/09/2026 a horas 13:00",
    "objetoLibre": null,
    "renglones": [
        {
            "renglon": "1",
            "descripcion": "1 unidad de utiles de oficina listado en solicitud de compra obrante en archivo adjunto -Rubro: UTILES DE OFICINA"
        }
    ],
    "pliegoPdfUrl": "https://comprasbys.tucuman.gob.ar/aplicacion/a_pdf/Licitacion8902.pdf",
    "estadoCompra": "1",
    "estadoCompraLabel": "Apertura proxima",
    "record_id": "8902",
    "event_type": "NEW_LISTING",
    "scraped_at": "2026-09-04T21:27:58.988Z",
    "is_new": true,
    "previousEstado": null,
    "contentHash": "9785babab5db93ae71cfb9c3c49e96bca7fdc99e",
    "source_url": "https://comprasbys.tucuman.gob.ar/ver_llamados_compras_avanzado.php?n=1&pagina_actual=3&estado_compra=1#myModal8902"
}
```

`estadoCompra` is `1`/`2`/`3` across every record - upcoming, in-adjudication and awarded tenders all come back in this same shape, with `fechaAdjudicacion` populated only once a tender is actually awarded. `pliegoPdfUrl` links directly to the bid-document PDF when the portal has one linked.

| Field | Description |
| --- | --- |
| `idCompra` | Tender ID |
| `estadoCompra` / `estadoCompraLabel` | `1`/`2`/`3` and its label (upcoming, in adjudication, awarded) |
| `reparticion` | Buying organism |
| `tipoCompra` | e.g. "LICITACION PUBLICA", "CONCURSO DE PRECIOS", "CONTRATACION DIRECTA" |
| `rubro` | Category |
| `numeroExpediente` | File number |
| `numeroConvocatoria` | Human-readable call number |
| `primerRenglon` | First line item, as shown on the listing card |
| `renglones` | Full line-item breakdown: `{renglon, descripcion}[]` |
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
| `record_id` | Same value as `idCompra` |
| `event_type` | `NEW_LISTING` / `STATUS_CHANGE` / `UPDATED` / `UNCHANGED` |
| `previousEstado` | Set only for `STATUS_CHANGE`: the estado this id was last seen under |
| `contentHash` | sha1 fingerprint of the changeable fields, used to detect `UPDATED` |
| `scraped_at` | ISO timestamp, same for every record in one run |
| `is_new` | True if this id was never returned by any previous run, under any estado |
| `source_url` | Listing page URL plus this record's own modal anchor |

## Reliability

- **Structural extraction, not brittle selectors.** The listing page's own HTML is malformed (unclosed tags, e.g. a stray `</b><br><br>` with no matching open tag), so cheerio's parser does not reliably reproduce the page's visual table nesting. Tenders are grouped by the label text `Reparticion:`, which reliably starts each tender's field block, verified across 45 real tenders on 9 fetched pages - not by walking `div.table` nesting, which was found to silently misalign records.
- **Fail loudly on a structural mismatch.** If the number of tender modals doesn't match the number of parsed card field-groups on a page, extraction throws rather than silently mispairing a card's fields with the wrong tender.
- **Correct charset decoding.** The portal serves `Content-Type: text/html;charset=ISO-8859-1`, confirmed live via response headers. Node's native `fetch()` `Response.text()` always decodes as UTF-8 regardless of that header, so this actor reads the raw bytes and decodes them explicitly with `TextDecoder('iso-8859-1')` instead.
- **Field labels handled across state-specific phrasing.** Estados 1/2 label the opening date `Apertura de sobres:`; estado 3 uses past tense with no colon, `Se abrio sobres el dia`. Both are matched via one `/sobres/i` pattern, with a regression test covering the difference.
- **Position-independent modal parsing.** Modal-only fields (`numeroConvocatoria`, `presupuestoOficial`, `garantiaOfertaExigida`, `lugarApertura`, `renglones`, `pliegoPdfUrl`, etc.) are matched by label-text regex against each field row rather than by row position, since the portal conditionally omits some rows (e.g. `Presupuesto oficial` isn't published for every tender), which would otherwise shift and mislabel every field after it.
- **Delta engine with real lifecycle tracking.** A single cross-estado map (`idCompra -> {estado, hash}`) is persisted between runs in this actor's own named key-value store (`tucuman-compras-monitor-delta-state`), capped at 6,000 ids and evicted by observation recency (not source order, since the source's own listing order is not reliably chronological - see below). A sha1 fingerprint over every field that can change within the same estado (montos, dates, renglones) detects `UPDATED` amendments at zero extra HTTP cost, since every field is already present in the one listing fetch this actor makes. A record is only marked "seen" once it is actually pushed to the dataset, so anything excluded by `dateRange`, `eventTypes`, or the run's charge limit is still correctly reported as changed on a later run.
- **Delta mode is a post-filter, not early-stop pagination, by design.** The portal's own listing order was verified live to be sorted by each tender's own opening-date field - ascending for estado 1, descending for estado 3 - not by when a tender was added to the site. A later page can hold a genuinely new tender while an earlier page is full of ones already seen, so this actor always fetches up to `maxItems` and filters for new/changed/amended tenders afterward, rather than stopping early once several pages return nothing new.
- **Retry with exponential backoff.** HTTP fetches retry up to 4 times with exponential backoff on failure, the same shape used across this developer's other monitoring actors.
- **Source data quality issues are disclosed, not silently fixed.** At least one live tender was found with a value genuinely truncated on the government's own portal (`lugarApertura` cutting off mid-word), confirmed against the raw source bytes. The actor extracts exactly what the source publishes rather than guessing at missing text.

## Pricing

This actor uses Apify's Pay-Per-Event pricing model:

| Event | Price | When |
| --- | --- | --- |
| `result` | $0.003 per record | Every delivered tender - every record already carries full modal-level detail (renglones, montos, pliego link) at identical extraction cost, so there is no separate cheaper listing-only tier |
| Actor start | $0.00005 | Once per run |

You pay only for the tenders this actor actually delivers to your dataset on each run, plus the fixed per-run start fee - there is no separate flat platform fee on top.

## Support & Enterprise SLA

This is an independently developed and maintained actor, not a vendor-backed enterprise product. Bugs, data-quality issues, or feature requests are best filed through this actor's issue tracker on the Apify Store page; the developer typically responds within about 48 hours. There is no contractual enterprise SLA or guaranteed uptime commitment attached to this actor - if your use case requires one, please reach out before relying on it for a mission-critical workflow so expectations are clear up front.
