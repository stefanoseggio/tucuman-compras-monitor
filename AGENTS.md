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
  but it is still the only *correct* way to handle this server, it costs
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
