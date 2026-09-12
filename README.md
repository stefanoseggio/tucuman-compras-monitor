# Tucuman Compras Monitor

<div align="center">

# Tucuman Argentina Licitaciones — Tender Delta API

**Delta-tracked monitor for the Province of Tucuman's public procurement portal — every licitacion, concurso de precios and contratacion directa, across upcoming, in-adjudication and awarded stages.**

[![Built for Apify](https://img.shields.io/badge/Built%20for-Apify-00C0FF?logo=apify&logoColor=white)](https://apify.com)
[![Pay-Per-Event](https://img.shields.io/badge/Pay--Per--Event-%240.003%2Ftender-blue)](#pricing-pay-per-event)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-brightgreen.svg)](./LICENSE)

[![Run on Apify](https://img.shields.io/badge/Run%20on-Apify%20Store-00C0FF?style=for-the-badge&logo=apify&logoColor=white)](https://apify.com/stefano_seggio/tucuman-compras-monitor)

Owner reference: [Console](https://console.apify.com/actors/TdJtze8dfyykMj2qA) · Actor ID `TdJtze8dfyykMj2qA`

</div>

---

## What it does

Tucuman's provincial procurement portal (`comprasbys.tucuman.gob.ar`) is the primary public record of every **Argentina government tender** — licitaciones publicas, licitaciones privadas, concursos de precios and contrataciones directas — issued by the province's ministries and organisms. The catch: the portal splits every tender across three separate, unlinked listings (upcoming opening, in-adjudication, awarded) with no changelog and no way to tell what changed since you last checked. Anyone tracking **Tucuman public procurement** — a supplier watching a `reparticion`, a bid consultant managing several clients, a journalist studying award patterns — is stuck re-reading pages of listings by hand just to spot the one new opening or one quietly amended budget.

This actor fetches full multi-renglon detail for every tender — buying organism, rubro, montos, opening date, pliego PDF — from all three lifecycle stages in one pass, and its delta engine tracks each `idCompra` across stages so a scheduled run reports only what is genuinely new, has moved to a new stage (`STATUS_CHANGE`), or was amended in place (`UPDATED`). Everything needed to act on a tender — including the direct pliego PDF link — ships inline in the same record; there is no separate detail-page fetch on this source, so nothing is missed and nothing costs extra to enrich.

It runs as a standard Apify Actor with Pay-Per-Event pricing: you pay only for the tenders actually delivered to your dataset, on top of a fixed per-run start fee — nothing for pages fetched, ids tracked, or runs that turn up no changes.

## Architecture

```mermaid
flowchart TD
    A["comprasbys.tucuman.gob.ar<br/>estado_compra = 1 / 2 / 3 listings"] --> B["Fetch raw response bytes<br/>decode as ISO-8859-1 (TextDecoder)"]
    B --> C["cheerio: group fields by the<br/>'Reparticion:' label text<br/>(not div.table nesting — verified unreliable)"]
    C --> D["Extract card + modal fields:<br/>renglones, montos, garantia,<br/>pliego PDF, autorizado por"]
    D --> E["sha1 contentHash over<br/>every changeable field"]
    D --> F["Cross-estado delta map<br/>idCompra → {estado, hash}<br/>(named key-value store, capped at 6,000 ids)"]
    E --> F
    F --> G{"onlyNew input?"}
    G -- "false" --> H["Deliver every fetched tender"]
    G -- "true" --> I["Classify: NEW_LISTING /<br/>STATUS_CHANGE / UPDATED / UNCHANGED"]
    I --> J["Filter by eventTypes + dateRange"]
    J --> H
    H --> K(["Actor start event<br/>charged once per run"])
    H --> L(["result event<br/>charged per delivered tender"])
    K --> M[(Apify Dataset)]
    L --> M
```

## Features

| Feature | Description |
| --- | --- |
| Three-stage coverage | Fetches upcoming (`estado=1`), in-adjudication (`estado=2` — 3,700+ historical records), and awarded (`estado=3`) tenders from one actor and one input |
| Full detail inline | Every record already includes `renglones`, montos, `garantiaOfertaExigida`, `pliegoPdfUrl` and more — no separate detail-page fetch exists on this source, so nothing is fetched twice |
| Delta mode (`onlyNew`) | Cross-estado lifecycle tracking per `idCompra`, persisted in this actor's own named key-value store so scheduled runs survive between executions |
| Event classification | `NEW_LISTING`, `STATUS_CHANGE` (a real lifecycle transition, e.g. upcoming → awarded, with `previousEstado` set), `UPDATED` (an amendment caught via sha1 `contentHash`), or `UNCHANGED` |
| `eventTypes` filter | Narrows delta-mode delivery to just the event kinds you care about |
| `dateRange` filter | Restricts to tenders whose `fechaAperturaSobres` falls in the last 24h / 7d / 30d — meaningful on estados 2 and 3 (estado 1's opening date is always in the future by definition) |
| Correct charset decoding | The portal serves `ISO-8859-1` but Node's native `fetch().text()` always assumes UTF-8; this actor reads raw bytes and decodes explicitly to avoid mangled accented text |
| Fail-loud structural extraction | Throws if the number of tender modals doesn't match the number of parsed field-groups on a page, rather than silently mispairing one tender's fields with another's |

## Quick start

```bash
apify call tucuman-compras-monitor --input '{
  "estados": ["1", "2"],
  "maxItems": 50,
  "onlyNew": true,
  "eventTypes": ["NEW_LISTING", "STATUS_CHANGE", "UPDATED"]
}'
```

This fetches up to 50 tenders across the upcoming and in-adjudication stages, and — because `onlyNew` is on — delivers only tenders that are new, moved to a different estado, or amended since your last run.

## Input

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `estados` | array | `["1"]` | Procurement states to fetch: `1` upcoming opening, `2` in adjudication, `3` awarded |
| `maxItems` | integer | `100` | Hard cap on tenders returned this run, across all selected states — the portal lists 5 per page and `estado=2` alone holds 3,700+ records, so start small |
| `onlyNew` | boolean | `false` | Delta mode: returns only tenders new, transitioned, or amended since a previous run |
| `eventTypes` | array | all three | Which of `NEW_LISTING` / `STATUS_CHANGE` / `UPDATED` to deliver when `onlyNew` is on |
| `dateRange` | string | _(none)_ | `"24h"` / `"7d"` / `"30d"`, filtered on `fechaAperturaSobres`, independent of `onlyNew` |

## Pricing (Pay-Per-Event)

| Event | Price | When it's charged |
| --- | --- | --- |
| `result` | **$0.003** | Once per tender delivered to your dataset |

Every delivered record already carries full modal-level detail — renglones, montos, garantia, pliego link — at identical extraction cost, so there is no separate cheaper "listing-only" tier: what you see in the output above is the full price list. You pay only for tenders this actor actually delivers on a given run; a scheduled `onlyNew` run that finds nothing new or changed costs nothing beyond the actor's fixed per-run start fee.

## Why not just scrape it yourself

- **Zero infrastructure** — no server, container, or cron box to keep patched and running just to poll a government listing page on a schedule.
- **Managed scheduling** — Apify's built-in scheduler handles recurring runs, retries, and run history without you wiring up your own job runner.
- **No proxy or session babysitting** — the portal is fetched directly with retrying, backing-off HTTP requests; there's no login, cookie jar, or rotating proxy pool to maintain for a public listing page.
- **Built-in delta and change detection** — the cross-estado lifecycle map and sha1 `contentHash` amendment detection already exist here; replicating `STATUS_CHANGE` vs. `UPDATED` classification yourself means re-solving the same state-tracking problem this actor already handles.

## Known limitations

- **Source data quality is disclosed, not silently patched.** At least one live tender was found with a field genuinely truncated on the government's own portal (`lugarApertura` cutting off mid-word); this actor extracts exactly what the source publishes rather than guessing at missing text.
- **`dateRange` has no effect on `estado=1` by design.** Upcoming tenders' `fechaAperturaSobres` is always in the future, so a backward-looking date window can never match there — it only filters meaningfully on estados 2 and 3.
- **No migration from the v1 delta state.** Upgrading a scheduled task from the v1 per-estado tracking to the current cross-estado engine re-baselines on its first run rather than migrating old state, since the two shapes cannot be reconciled.
- **No contractual enterprise SLA.** This is an independently developed and maintained actor, not a vendor-backed enterprise product; there is no guaranteed uptime commitment attached to it today.

## Node.js example

See [`run-monitor.js`](#nodejs) below — authenticates via `APIFY_TOKEN`, calls the actor, and prints each delivered tender.

## Python example

See [`run_monitor.py`](#python) below — same call pattern using the `apify-client` PyPI package.

---

### About Delta Registry

`tucuman-compras-monitor` is part of **Delta Registry** — pay-per-event regulatory & compliance data infrastructure, built as a fleet of delta-tracked monitoring actors on Apify. For professional inquiries or enterprise licensing, reach out on [LinkedIn](https://www.linkedin.com/in/stefanoseggio-deltaregistry); for the rest of the fleet, see [github.com/stefanoseggio](https://github.com/stefanoseggio).
