# Design: brain page aesthetic pass (P0 + P1)

All changes are confined to `dsh-qqbot-brain/src/server/page.html` (CSS + DOM-building JS) and `dsh-qqbot-brain/test/page.test.ts`. No API, no new assets, no framework.

## 1. Tokens and type scale (R6, P1-8)

- `--faint` `#4f6f90` → about `#6f8fae`, so 10–11px text on `--panel` (#061528) gets ≥ 4.5:1. Verify the ratio with a quick calculation during implementation; `--muted` stays.
- Add a type scale and map the stray sizes onto it: `--fs-xs:10px` (mono labels), `--fs-sm:11px`, `--fs-md:12px`, `--fs-base:13px`, `--fs-h3:15px`, `--fs-h2:18px`, `--fs-h1:26px`. Remove 9px (`.cnt`) and 12.5px (`.persona-edit`); 8.5px inside SVG charts stays because the SVG scales it.
- Add `--radius:2px` and use it on panels, cards and buttons for one consistent near-square language. The bubble and pills stay round on purpose, as character elements.

## 2. P0 fixes

- **P0-1 `#qSess`**: turn `.search` from a `<label>` into a `<div class="search">` containing the ⌕ glyph (replaced by an inline SVG magnifier), the input, a 1px divider and the select (`.search select`: transparent, no border, `appearance:none`, custom chevron, max-width 110px). The ≤640 rule already makes `.search` static, so the select comes along inline. JS references by id do not change.
- **P0-2 `.ctrl`**: `white-space:nowrap`. Toggle text becomes `漂浮` / `信号` (state shown by the `aria-pressed` cyan style plus a small dot via `::before`). `updateSignalBtn` / `updateParticleBtn` set the short text, and `aria-label` keeps the full meaning ("神经信号：开").
- **P0-3 mobile header**: at ≤640, `.brand b` letter-spacing .12em and `white-space:nowrap`; hide `.brand small`; `.status` gets `min-width:0` and its first span gets `text-overflow:ellipsis`.

## 3. Label LOD on the map (R3, D1)

- New pure helper inside the extractable range (before `bindMapNode`): `labelPick(items, n)` takes `[{id, retention, importance}]` and returns a `Set` of the top-n ids by `retention*importance`, with ties broken by id so the result is deterministic.
- `render()` computes `LABELED = labelPick(shown notes, 8)` and adds `SELECTED` if present. Memory nodes outside the set get class `quiet`.
- CSS: `.mem.quiet .cap{opacity:0;transition:opacity .15s}`. Labels reappear on `.mem.quiet:hover`, `:focus-visible`, `.focus .mem.lit`, `.selected`, and `#brain.zoomed .mem.quiet`.
- `setView()` toggles `brainSvg.classList.toggle('zoomed', VB.w < 580)`. Desktop home 840 → one ＋ (560) reveals; the mobile home view (600) stays calm.
- `layoutSlots` boxes are unchanged, so revealed labels never collide. The cortex map contract (fixed slots, CAP, +N) is preserved.
- Region labels: nudge `REGIONS` NEOCORTEX label up/left so it does not sit on the outline (coordinate tweak only).

## 4. Stage composition (R4, P1-6)

- Tighten `VB_HOME` and the SVG `viewBox` from `100 20 840 600` to roughly `110 40 820 586` (same aspect), so the brain body fills more of the stage and sits centred under the title row. Tune the final numbers by screenshot. Mobile initial VB is re-checked against the new home.
- Stage foot: put the legend on one quieter line; the footnote "沉淀巩固为实录…" moves into the legend `title` tooltip. `.ctrls` becomes a compact grouped toolbar: a shared border, 32px tall, ＋/－ icon-sized.

## 5. Inspector overview density (R2, P1-4)

- `overview()`: for persona and emotion, render `meterRow` only for count > 0 (plus the current mood bucket always). Zero-count entries collapse into one `.chips` line: "未关联：A · B · C", each a small button that still calls `panel(key)`. If every count is 0, show the chip line only, with an explanatory sentence.
- The section titles keep the "（推断）" labelling required by the spec.

## 6. Lower half unified with the cortex language (R5, P1-7)

- Cards: `min-height` 146 → ~112; border `var(--line2)`; translucent panel background `#0a1f36b3` with a 2px left accent in the type colour; title clamped to 2 lines; tag row shows type in its type colour.
- Tabs: no solid fill. Active = `color:var(--cyan)` + 2px bottom inset glow line; inactive = muted text, no box borders. Container keeps one bottom hairline.
- Table: action buttons 11px, padding 3px 10px; row hover uses the same `#0f2a48` as hits.
- Shared `select` style: `appearance:none` + inline-SVG chevron `background-image` (data URI, no asset), applied to toolbar, addform, persona controls, note-edit.

## 7. Mobile (R7, D2, P1-9)

- ≤1000: `.portrait` height 240 → 120; image cropped to the face (`object-position` tuned), bubble left, `max-width:62%`; `.portrait-title` hidden.
- ≤640: `table.lib` collapses to stacked rows: `thead` hidden, `tr` as a block card; first cell full width (content), the rest inline as `label: value` via `td::before{content:attr(data-label)}`. `renderLibrary` adds `data-label` to each `td` (small JS change). `min-width:670px` is removed under ≤640.

## 8. P2 cleanup (R8)

- Remove duplicated `.meter` rules (keep one) and fold the late `.bottom/.vault/.fnote` overrides into their original declarations.

## Compatibility / rollback

- Single-file change; rollback = `git revert`. Element ids are untouched, so the 15s refresh, draft preservation and token passthrough paths are unaffected.
- Risk: the viewBox change shifts mobile initial view and the zoom clamp. Mitigation: re-run the headless zoom checks from `11-04-brain-mobile-ux2` (double-tap, ＋, reset).
