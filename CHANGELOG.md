# Changelog

## 2.0.0 - 2026-09-08

The v2 delta engine: real lifecycle transitions and amendment detection, replacing the v1 retrofit's "always NEW_LISTING" limitation - see AGENTS.md "Delta engine v2" for the full technical reasoning.

### Added

- **`STATUS_CHANGE` events**: a tender that moves to a different `estado_compra` since it was last seen (e.g. upcoming -> awarded) is now reported as `STATUS_CHANGE` with `previousEstado` set, instead of a fresh `NEW_LISTING` under its new estado.
- **`UPDATED` events**: a tender whose content changed (monto, renglon, date, any other field) while staying in the same estado is detected via a sha1 content fingerprint (`contentHash`) and reported as `UPDATED` - at zero extra HTTP requests, since every field is already inline in this actor's one listing fetch per page.
- **`eventTypes` input**: narrows delta-mode delivery to a subset of `NEW_LISTING`/`STATUS_CHANGE`/`UPDATED`.
- `contentHash` and `previousEstado` output fields; a second dataset view ("Status changes & amendments").
- Apache-2.0 `LICENSE`, this `CHANGELOG.md`, an `npx eslint .` step in CI.

### Changed

- **Delta state shape**: `src/state.ts` replaced the v1 per-estado `{ seenIds, lastRunAt }` map with one flat, cross-estado map (`idCompra -> { estado, hash }`) - the per-estado design could not itself distinguish "genuinely new" from "moved here from another estado", which is exactly what `STATUS_CHANGE` needed to know. **Not backward compatible**: a v1-shaped state is treated as absent, not migrated - an existing scheduled task's next run re-baselines (see AGENTS.md).
- Pricing: single `result` event at $0.003/record (was $0.001, uncharged distinction). No `result-summary` tier - unlike sibling fleet actors, every Tucuman record already includes full detail at identical extraction cost, so a cheaper listing-only tier would not reflect any real cost difference (disclosed in README).
- `is_new` keeps its exact v1 meaning (never seen before, under any estado) - not redefined to mean "something changed".

### Fixed

- Production `start` script pointed at `start:dev` (`tsx`), which Apify's production image cannot run (`npm install --only=prod` strips `tsx`). Switched to the prebuilt `dist/main.js` and stopped gitignoring `dist/` so the build actually ships.
