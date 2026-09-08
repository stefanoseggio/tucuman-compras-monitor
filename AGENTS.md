# AGENTS.md - Tucuman Compras Monitor

Technical notes for whoever (human or AI) touches this actor next. Written
plainly, disclosing real gaps rather than hiding them.

## What this actor does

Extracts public tenders (Licitaciones Publicas, Licitaciones Privadas,
Concursos de Precios, Contrataciones Directas) from the Province of
Tucuman, Argentina's official procurement portal
(`comprasbys.tucuman.gob.ar/ver_llamados_compras_avanzado.php`), across its
3 states (`estado_compra`: 1 = apertura proxima, 2 = en adjudicacion,
3 = adjudicadas), with organism, expediente, full multi-renglon line-item
breakdown, montos, lugar/fecha de apertura, and a direct pliego PDF link -
all inline in the listing response, no separate detail request needed.

## What the audit notes got wrong or missed (live-reverified 2026-09-04)

The audit notes for this target were directionally right about the
low-level facts (200 OK from a plain IP, `nginx/1.20.1`,
`X-Powered-By: PHP/4.4.2-1build1`, `charset=ISO-8859-1`, GET-querystring
pagination, no ViewState/postback, no SPA markers - all confirmed live,
byte-for-byte on the 90789-byte sample) but wrong or silent on the parts
that actually determine the parser design:

1. **"5 real tenders... in a table" is misleading.** The page does have
   10 `<table>` / 81 `<tr>` tags (that count was right), but those are
   small internal tables inside each tender's own detail modal (a
   RENGLON/DESCRIPCION table, a label/value montos table) - **the listing
   itself is not a table at all**. Each tender is a repeated Bootstrap
   `<div class="table">/<div class="row">/<div class="column">` block, and
   the site's real HTML is malformed enough (unclosed tags, broken
   comments, e.g. line 730's `</b><br><br>` with no matching open `<b>`)
   that cheerio's forgiving parser does **not** reproduce the page's
   intended visual nesting - a naive `div.table` selector matches nested
   parent/child tables and silently misaligns every record by one slot.
   The actual robust grouping key, verified against 45 real tenders across
   9 fetched pages: the label text `Reparticion:` reliably starts a new
   tender's field block (`groupCardFields` in `src/parsers/listing.ts`),
   independent of any table nesting cheerio may or may not preserve.
2. **"Link to a detail page - not yet explored" is answered: there is no
   usable separate detail page, and none is needed.** The only detail
   link (`detalle_llamado.php?id_compra=N` on the SAME domain) is
   commented out of the live HTML (`<!--<a ...>-->`) - dead. The one link
   that IS live ("Imprimir") points to a **different domain**,
   `rig.tucuman.gov.ar/obras_publicas/aplicacion/detalle_llamado.php`.
   That domain does resolve and does return 200 (verified live) - but
   fetching it for `id_compra=8898` returned a byte-for-byte **duplicate**
   of the exact same modal content already embedded in the listing page
   (same objeto text, same renglon table, same everything - it is a
   legacy print view of data the listing page already has, not richer
   data). Conclusion: **the entire tender record - full multi-renglon
   breakdown, montos, lugar, informes, pliego PDF link - is already
   inline in one listing-page fetch.** This actor makes exactly one HTTP
   request per page of 5 tenders; it never fetches a second domain or a
   per-item detail URL.
3. **Field labels are not stable across `estado_compra` values** - this
   would have broken any parser keyed on exact label text without
   checking more than one state. Estado 1/2 use `Apertura de sobres:` for
   the opening date; estado 3 uses a completely different phrase, **past
   tense**, no colon: `Se abrio sobres el dia`. Both are matched here via
   a single `/sobres/i` pattern rather than an exact label string -
   `test/parsers/listing.test.ts` has a named regression test for this.
4. **The listing card only ever shows the first line item ("Renglon Ndeg 1")
   even when a tender has several.** Verified live: tenders with 2, 3 and
   4 renglones exist (found by scanning 40+ real pages) and the outer card
   never prints "Renglon Ndeg 2" etc. The full breakdown IS present, but
   only inside the tender's own modal's `<table border="1">` - parsed
   separately into `renglones[]`. Depending only on the card's
   `primerRenglon` would have silently dropped every renglon after the
   first on every multi-line tender.

## Architecture

Plain `fetch()` + cheerio, no Crawlee, no browser - confirmed unnecessary:
GET-only querystring pagination (`?n=1&pagina_actual=N&estado_compra=N`),
zero JS-rendered content, zero DevExpress/React/Angular/Vue markers
(grepped for all of them live, zero matches). No proxy - reachable with a
plain 200 OK from this development machine's plain datacenter IP for
every request made while building this (listing pages, the alternate
`rig.tucuman.gov.ar` domain, and the pliego PDF endpoint).

- `src/http.ts` - `fetchWithRetry` (exponential backoff, same shape as
  every sibling actor in this portfolio) + `fetchHtmlWithRetry`, which
  reads the response as an `ArrayBuffer` and decodes it with
  `new TextDecoder('iso-8859-1')`. This is a **real, verified**
  requirement, not a defensive assumption: the server's own
  `Content-Type: text/html;charset=ISO-8859-1` header was confirmed live,
  and `Response.text()` in Node's native `fetch()` always decodes as
  UTF-8 regardless of that header. In practice, on every page sampled,
  the actual field DATA (reparticion, tipo, rubro, objeto, montos, all of
  it) is HTML-entity-encoded (`&oacute;`, `&iacute;`, `&Uacute;`, `&deg;`,
  `&ordm;`, ...) rather than raw extended-Latin1 bytes - the only raw
  non-ASCII bytes found live were inside a couple of dead HTML
  **comments** (e.g. `http://172.16.0.33/obras_publicas/ ó ...`), which
  never reach parsed field values. So explicit ISO-8859-1 decoding turned
  out to matter less in practice than the audit notes' framing implied -
  but it is still the only _correct_ way to handle this server, it costs
  nothing, and it protects against the one raw-byte field the next scrape
  might hit that this sample run didn't.
- `src/parsers/listing.ts` - `parseListingPage(html, pageUrl)`:
    - `numTotal` from the always-present `<input name="num_total" ...>`
      hidden field (confirmed present and correct even on empty/
      out-of-range pages).
    - Tender identity + doc order from `div.modal[id^="myModal"]`
      (`id="myModal{idCompra}"` - reliable, 1:1 with real tender count on
      every page sampled, including the 1-item and 3-item partial last
      pages of estado 1 and estado 3).
    - Card fields via `groupCardFields`: a flat, in-order scan of every
      `[id="fondo_gris"]` label element (NOT a nested-table walk - see point
      1 above), paired with modal index by position. A hard structural
      mismatch (different tender count between modals and card groups)
      throws rather than silently mispairing records - see the "fail
      loudly" reasoning in the Known limitations section.
    - Modal-only fields (`numeroConvocatoria`, `autorizadoPor`,
      `presupuestoOficial`, `garantiaOfertaExigida`, `lugarApertura`,
      `informesAdquisicionPliegos`, `objetoLibre`, `renglones[]`,
      `pliegoPdfUrl`) via label-text regex matching against each 2-`<td>`
      row of the modal's `table[width="400"]` (never by row position - the
      site conditionally omits some rows, e.g. `Presupuesto oficial` or
      `Garantia de oferta exigida` are only present for some tenders, which
      shifts every row after them; position-based extraction would have
      silently mislabeled fields on those tenders).
    - `pliegoPdfUrl` resolved with `new URL(href, pageUrl)` - the site's own
      relative href (`../aplicacion/a_pdf/X.pdf`) resolves correctly per
      the WHATWG URL spec even though it walks `..` past what looks like
      root, because the page itself lives at
      `/ver_llamados_compras_avanzado.php` (one path segment deep). Verified
      live: the resolved URL returns a real `Content-Type: application/pdf`.
- `src/fetchListing.ts` - `fetchTenders(estados, maxItems)`: for each
  selected `estado_compra`, fetches page 1, computes
  `totalPages = ceil(numTotal / 5)` (5 tenders/page confirmed on every
  page sampled, including partial last pages returning the true
  remainder - e.g. estado 1's 31 total = 6 full pages + a genuine
  1-tender last page), then walks pages sequentially until `maxItems` is
  reached, a page returns 0 items (defensive stop), or a page fails after
  retries (logs a warning and moves to the next estado rather than
  aborting the whole run).
- `src/main.ts` - standard `Actor.init()/run()/exit()`, charges
  `RESULT_EVENT_NAME='result'` once per pushed item, stops on
  `eventChargeLimitReached`.

## Delta engine v2 (2026-09-08)

Supersedes the "record_id / event_type" and "State design" subsections
below, which describe the 2026-09-06 v1 delta retrofit - kept in place as
history, not deleted, since the live evidence they document (pagination
order, why post-filter not early-stop) is still exactly correct and still
governs `src/fetchListing.ts`/`src/delta.ts` unchanged.

**What changed**: `event_type` is no longer always `NEW_LISTING`. The v1
"Known limitation" ("a tender that transitions from estado 1 to estado 3
between runs is reported again as a fresh NEW_LISTING... rather than some
invented AWARDED transition event") is now closed:

- `src/state.ts` replaced the per-estado `{ seenIds, lastRunAt }` map with
  ONE flat, cross-estado map: `idCompra -> { estado, hash }`. This is the
  real structural change v1 explicitly said would be needed - a per-estado
  seen-set can tell you an id is new *to that estado*, but cannot itself
  tell "genuinely new" apart from "just moved here from a different
  estado", because it never looks at the other estados' seen-sets at all.
- `src/fingerprint.ts` (new) hashes every field that can change while a
  tender stays in the same estado - montos, dates, renglones, the modal's
  full field set - with `sha1(JSON.stringify(...))`. Free to compute: no
  second HTTP request, since every field is already inline in the one
  listing fetch this actor has always made (see point 2 above - this is
  what makes Tucuman's UPDATE detection cheaper than sibling actors that
  need a separate detail-page re-read).
- `src/delta.ts`'s `classify()` compares a fetched tender against its
  stored entry: no entry -> `NEW_LISTING`; entry exists, different estado
  -> `STATUS_CHANGE` (with `previousEstado` set to the old one); entry
  exists, same estado, different hash -> `UPDATED`; same estado, same hash
  -> `UNCHANGED` (only ever delivered when `onlyNew=false` - a full run
  now genuinely means "everything", not just "everything, but the
  event_type field is decorative").
- `is_new` keeps its v1 meaning exactly (`!entry`, i.e. never seen before,
  under any estado) - it is NOT redefined to mean "something changed"; a
  `STATUS_CHANGE` record has `is_new=false` (it WAS seen, just elsewhere).
- New optional `eventTypes` input narrows delivery to a subset of
  `NEW_LISTING`/`STATUS_CHANGE`/`UPDATED` when `onlyNew=true` - `UNCHANGED`
  is not in that enum since it is never something a delta-mode consumer
  asks for, only something a full-mode run can produce.
- **Pricing**: unlike Australia/UK HSE/Florida/Santa Fe, this actor has no
  `result`/`result-summary` split. Those sibling actors charge less for a
  listing-only record because fetching full detail costs a SECOND request
  their `fetchDetail: false` mode skips. Tucuman never had that second
  request to skip (see point 2) - every record, always, already has full
  detail at identical extraction cost. Inventing a cheaper tier here would
  be pricing theater, not a real cost difference, so every delivered
  record (`NEW_LISTING`, `STATUS_CHANGE` or `UPDATED`) is charged the same
  single `result` event. Disclosed in README "How much does it cost".
- **State shape is NOT migrated**: `loadDeltaState` treats a v1-shaped
  blob (`{ estados: {...} }`) as absent (`isValidState` returns false) and
  starts cold rather than attempting a risky in-place reinterpretation. An
  existing scheduled task's next run re-baselines - every currently-known
  id is reported once more as whatever it now classifies as, cheap at this
  register's real size (few thousand ids total).

## Delta engine retrofit (2026-09-06)

Added `onlyNew`/`dateRange` input, a per-estado seen-id store, and a
standardized 5-field output envelope, matching the shape shipped and
cloud-verified on the fleet's UK HSE Enforcement Monitor actor - except
for the pagination-strategy deviation documented below, which this
actor's own live behavior genuinely required.

**Files touched**: `src/types.ts` (additive: `DateRange`,
`onlyNew`/`dateRange` on `ActorInput`, `DeltaEnvelopeFields`,
`TenderOutputRecord`), `src/main.ts` (orchestration), plus four new
modules: `src/state.ts`, `src/dateFilter.ts`, `src/envelope.ts`,
`src/delta.ts`. **Not touched at all**: `src/http.ts`,
`src/parsers/listing.ts`, `src/fetchListing.ts` - the entire existing
fetch/decode/parse/paginate pipeline is untouched, byte for byte, so
`test/fetchListing.test.ts` and `test/parsers/listing.test.ts` needed no
changes and still exercise exactly the code they always did. This also
means the delta filters cannot affect the encoding path or the pagination
mechanics at all, by construction, not just by care.

### Why a POST-FILTER, not early-stop pagination - live evidence

The generic delta-engine contract prefers early-stop (stop paginating
after N pages with zero unseen ids) when the source is reliably
newest-first. Before assuming that, this portal's live pagination order
was checked directly (2026-09-06), and it is **not** newest-first at all

- it is sorted by each tender's own **opening-date field**, which tracks
  nothing about when the tender was added to the site:

```
estado_compra=1 (apertura proxima) - modal ids in page order, then that
page's own fechaAperturaSobres values:
  page 1: ids 8900,8891,8873,8858,8848  -> dates all 07/09/2026
  page 2: ids 8831,8830,8897,8850,8907  -> dates 07/09 through 09/09/2026
  page 3: ids 8903,8902,8834,8920,8919  -> dates 09/09 through 10/09/2026
```

Page 3 contains id `8920` - higher (almost certainly _more recently
created_) than anything on page 1 or 2. The site is sorting by **ascending
scheduled opening date** (soonest-opening tender first), not by insertion
order. A brand-new tender added today with an opening date three weeks
out would land on a page far past where early-stop would have already
given up - early-stop would silently miss it. Confirmed the same
phenomenon in the opposite direction on `estado_compra=3` (adjudicadas):
page 1 covers 24/10/2023 down to 09/11/2022, page 2 continues
01/11/2022 down to 06/07/2022 - **descending** opening date, again
nothing to do with discovery order. Both estados currently have zero
stall-guard/dedup logic in `fetchListing.ts`, which by itself was already
a mild hint this hadn't been relied upon - this live check made it
certain. Given this, `onlyNew` is implemented as the spec's documented
safe fallback: `fetchTenders()` (unchanged) still fetches up to `maxItems`
exactly as before, and `src/delta.ts` filters the result afterward. A
correct, honestly-scoped post-filter beats a fast but wrong early-stop.

### record_id / event_type

- `record_id` reuses `idCompra` verbatim (already the site's own unique
  tender id) - no hashing, per spec.
- `event_type` defaults to `NEW_LISTING` for every record, always. Unlike
  HSE's convictions (where "a conviction record IS an imposed sanction"
  justified `SANCTION`), nothing about a Tucuman listing intrinsically
  signals a more specific event without real field-level diffing between
  runs - explicitly out of scope for this pass. One consequence worth
  naming directly: a tender that transitions from estado 1 to estado 3
  between runs is reported again as a fresh `NEW_LISTING` (with
  `is_new: true`) under estado 3, rather than as some invented "AWARDED"
  transition event this pass cannot actually back with diffing. That is
  a deliberate, disclosed limitation, not an oversight.

### State design: keyed per estado_compra, not one global seen-set

The seen-id store (`src/state.ts`, KV store name
`tucuman-compras-monitor-delta-state`) tracks `{ seenIds, lastRunAt }`
**per `estado_compra`**, mirroring HSE's convictions/notices split, rather
than one flat set of ids across the whole actor. Reasoning: the same
`idCompra` legitimately reappears under a different `estado_compra` as a
tender progresses through its real lifecycle (1 -> 2 -> 3). A global seen
set would treat "id already seen under estado 1" as reason to hide it
forever once it shows up later under estado 3 - exactly the case a B2B
monitoring consumer cares about most (a tender has now actually been
awarded). Scoping the seen-set per estado means a tender's first
appearance in EACH estado is correctly flagged `is_new: true`.

A second, related decision: `main.ts` marks an id "seen" only once it is
actually **pushed** to the dataset this run - not merely fetched. If
`dateRange` (or the per-run charge limit) excludes a genuinely new tender
from this run's output, it is deliberately left un-marked, so a later run
without that exclusion still reports it as new rather than silently
losing it. `is_new` itself is still computed for every fetched tender
regardless of what gets filtered out, per spec, so a plain non-delta run
always shows accurate `is_new` values.

`mergeSeenIds` caps each estado's array at `MAX_SEEN_IDS_PER_ESTADO`
(3000). Since the source's own order can't be trusted as "oldest last"
(see above), the cap evicts by **observation recency** instead - this
run's newly-pushed ids go to the front, so if the cap is hit, the ids
dropped are whichever this scraper itself has gone longest without
re-observing. That is a real, disclosed deviation from "newest ids
first, since the source is newest-first" in the generic contract, made
necessary by the same finding as the pagination-strategy deviation above.

### source_url: there is no real per-record detail URL to reuse

Per point 2 above, the only per-tender detail link this site ever had
(`detalle_llamado.php?id_compra=N`) is dead - commented out of the live
HTML. There is nothing named `detailUrl` to rename. The closest
`listingPageUrl` field only pointed at a _page_ (up to 5 tenders), not
this specific record. `source_url` is built as
`` `${listingPageUrl}#myModal${idCompra}` `` - a real, fetchable URL (the
fragment is inert on plain fetch, so this still resolves to exactly the
page the data came from) that additionally disambiguates which of the
page's ~5 tenders this record is, via the same DOM id
(`#myModal{idCompra}`) the parser itself already keys off. `scrapedAt`/
`listingPageUrl` are dropped from the final pushed object (replaced, not
duplicated) - `src/envelope.ts` builds the actual output shape from a
`TenderRecord`.

### dateRange: which "natural date field", and a real estado-1 gotcha

This source publishes exactly one per-tender date that varies
consistently across all three estados: `fechaAperturaSobres` (the bid
opening date/time - present via a single `/sobres/i` label match across
both the estado-1/2 phrasing and estado 3's past-tense phrasing, see
point 3 above). `fechaAdjudicacion` was considered and rejected as the
primary field - it is `null` for the large majority of tenders (only
populated for awarded ones).

Real gotcha, found by checking live data rather than assuming: for
`estado_compra=1` ("apertura proxima" - upcoming opening), every sampled
`fechaAperturaSobres` was **in the future** relative to the run (by
definition - these tenders haven't opened yet). `dateRange`'s window is
implemented as the standard backward-looking "in the last N" (matching
the generic contract's shape), so it will **never** match an estado-1
tender - not a bug, but exactly the kind of "field can be misleading"
case the HSE Offence-Date precedent calls for disclosing plainly rather
than shipping quietly. `estado_compra=2`/`3` do not have this problem:
by the time a tender is "en adjudicacion" or "adjudicada", its own bid
opening has already happened, so `fechaAperturaSobres` there is a real
past date and `dateRange` filters meaningfully. Documented in
`README.md` "Delta mode" and in the input schema's own description.
`src/dateFilter.ts` parses the site's own `"DD/MM/YYYY[, HH:MM:SS]"`
format directly (no ISO date strings exist on this source) and returns
`null` (excluded from any dateRange-filtered output, never thrown) for
anything that doesn't match.

### Known limitation carried over from this pass (RESOLVED 2026-09-08)

Was: no field-level diffing/UPDATE detection - `event_type` is always
`NEW_LISTING`, and an estado transition (e.g. awarded since last run) is
not reported as a distinct event type. Closed by the "Delta engine v2"
section above (`STATUS_CHANGE` + `UPDATED` via a cross-estado, content-
fingerprinted state). Kept here, marked resolved rather than deleted, so
the historical disclosure trail stays intact.

### A real gotcha hit while doing this: prettier vs. this repo's own fixtures

`npm run format:check` was **already failing** on the pre-existing
`test/fixtures/*.html` files before this retrofit touched anything
(confirmed by stashing this change and re-running it against the bare
`65edf2a` commit) - prettier's HTML parser cannot parse the site's own
malformed markup (unclosed `<b>`/`<div>` tags) that these fixtures
deliberately preserve byte-for-byte from the live portal. Fixed by adding
`test/fixtures` to `.prettierignore` (these are captured snapshots, never
meant to be reformatted) rather than "fixing" the fixtures' intentional
malformation. Also excluded `package-lock.json` from prettier's scope
after a first `format --write` pass rewrote ~15k lines of it to a
different (but functionally identical) style with no relation to this
work - npm regenerates that file in its own format regardless, so hand
"correcting" it is pure diff noise, not a real fix.

## A real source-data quality issue found while sanity-checking the local run

Live tender `id_compra=8900` (estado 1) has a **genuinely truncated**
`lugarApertura` value on the government's own portal: the raw HTML is
`...Jefatura de Policia -  Italia N&</b></td>` - it cuts off mid-word
right after a bare `&` with no entity name, one paragraph before a
different field (`informesAdquisicionPliegos`) that correctly spells out
the same address in full (`...Italia N&deg; 2601 SM Tuc - Hasta el
dia...`). Confirmed with `curl` + `grep` against the live raw bytes before
concluding this - it is not a decoding bug, not a parser bug, and not
something `Response.text()` vs `TextDecoder` would change either way: the
value is short one field on the source's own listing card. The actor
extracts exactly what the source publishes; this is disclosed here rather
than "fixed" by guessing what the missing text might have said.

## Known limitations (disclosed, not hidden)

- **No dedicated `fetchDetail` input toggle**, unlike some sibling actors
    - there is nothing to toggle, because there is no separate detail
      request to skip (see point 2 above). One request per 5 tenders,
      always.
- **`estado_compra=2` (en adjudicacion) has a very large backlog** -
  `num_total=3707` live (vs. 31 for estado 1 and 313 for estado 3), i.e.
  742 pages of 5. `maxItems` defaults to 100 for exactly this reason -
  raising it a lot for estado 2 specifically means a lot of sequential
  requests. This was verified live, not assumed; it likely reflects the
  portal keeping a long historical "in adjudication" list rather than
  only currently-open processes, but that interpretation was not
  independently confirmed against another source.
- **The listing card's own field labels can themselves vary in
  completeness or, in at least one confirmed case, be truncated at the
  source** (see above) - this actor does not attempt to reconstruct or
  guess missing text.
- **`fechaAdjudicacion` is `null` for the large majority of tenders** (it
  is only populated for estado 3 items in every sample fetched) - this is
  the real behavior of the source, not a parser gap; it is exposed as-is
  rather than defaulted to an empty string, so consumers can distinguish
  "not awarded yet" from "awarded with no recorded date".
- ~~No field-level diffing/UPDATE detection between runs~~ RESOLVED
  2026-09-08 - see "Delta engine v2" above.
- No pagination safety valve beyond `maxItems` and the 0-items-on-a-page
  stop condition - a user setting a very high `maxItems` against estado 2
  will genuinely issue hundreds of sequential requests. This is
  documented in the input schema's description rather than hard-capped,
  since a legitimate full-backlog run is a real, if slow, use case.

## Sibling candidates found via the same parallel audit (2026-09-04)

Recorded in `cordoba-compras-monitor/AGENTS.md` and
`santafe-compras-monitor/AGENTS.md`: Entre Rios (plain PHP, 2042+ rows,
zero DevExpress markers) and Salta (Apache/HTML server-rendered, real data
in the initial page load) were both flagged `viable` from the same
6-province audit that found Tucuman - re-verify live before building
either, per this project's standing rule, rather than trusting that
summary.
