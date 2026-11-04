# Quality Guidelines

> Code quality standards for frontend development.

---

## Overview

<!--
Document your project's quality standards here.

Questions to answer:
- What patterns are forbidden?
- What linting rules do you enforce?
- What are your testing requirements?
- What code review standards apply?
-->

(To be filled by the team)

## Brain page: overview versus detail

The live `/brain` UI is a dependency-free HTML/CSS/JS page at `dsh-qqbot-brain/src/server/page.html`; `npm run build` copies it to `dist/server/page.html`. The backend returns full `content` in `/brain/api/state` and `/brain/api/query`. Only the UI decides how much to show in each overview; never shorten `content` before passing it to the detail panel or writing it back.

Use `textContent` for API-sourced text, and CSS line clamping for a readable overview. If two memories share a long prefix, choose a preview that includes the differing part, while preserving the original `content` for detail and editing:

```js
card.querySelector('.title').textContent = previewText(note, notes);
detail.querySelector('.quote').textContent = note.content;
```

Keep the full memory library as a path to notes omitted from the capped SVG overview. Node and search-hit selection should lead to the same full-text detail. Page tests live at `dsh-qqbot-brain/test/page.test.ts` and run via `npm test`; they cover the inline script syntax and shared-prefix previews. When changing page interaction, also check the 15-second refresh path, long text, empty data and narrow layout.

### Brain page: cortex map contract (2026-11-01)

The main map is a fixed-layout brain cross-section (concept `mockup-mind-cortex.html`). Regions map to layers: prefrontal = persona facets, neocortex = semantic, parietal = attitude, hippocampus = episodic, amygdala = emotion buckets. Positions come from `layoutSlots()` (center-out greedy packing inside a region ellipse, label boxes must stay inside the brain outline and not overlap) — never reintroduce force simulation or drifting nodes. Per-region caps live in `CAP`; overflow shows a "+N" link into the library filtered by kind.

Cross-layer links are **frontend inferences** and must be labelled as such in the UI:

- Emotion: `emotionOps(OPS)` → `matchEmotion(note, emos)` picks the same-session `op:'emotion'` record within `[createdAt-5s, createdAt+10min]`; `emotionBucket(state)` prefers the distilled `mood` category (names match `MOODS` in `types.ts` one-to-one, 9 buckets), falling back to PAD inference for pre-mood records. `load()` fetches `/ops?limit=500` for this; the ops tab only renders the first 150. Keep `EMO_BUCKETS` names and the backend `MOODS` enum synchronized — a mood that has no same-named bucket silently falls back to v/a inference.
- Persona: `personaFacets(text)` splits the active persona on `^## ` (≤6, whole text when no headings); `matchFacet(note, facets)` requires ≥`FACET_MIN` shared letter/number bigrams that appear in fewer than half of the sections.

Pure helpers (`ngrams` … before `function bindMapNode`) are extracted by `test/page.test.ts`; keep new pure functions inside that range and free of DOM access.

### Brain page: visual system and label density (2026-11-04)

- **Tokens first.** Use the `:root` variables instead of literals: type scale `--fs-xs/sm/md/base/h3/h2/h1` (10/11/12/13/15/18/26px — no 9px or fractional sizes), `--radius` (2px; the speech bubble and pills stay round on purpose), `--hair` for hairline dividers, `--glass` for translucent panels. Small text colours must stay ≥ 4.5:1 on `--panel`: `--muted #7f9dbb` ≈ 6.5:1, `--faint #6c8aa8` ≈ 5:1. Re-check with a contrast calculation when changing either.
- **Selects are globally restyled** (`appearance:none` + inline-SVG chevron with `!important` on the background longhands). When styling a select, set `background-color`, not the `background` shorthand.
- **Map label LOD.** Memory nodes not in `labelPick(placedNotes, LABEL_N=8, per=2)` get class `quiet` and hide their `.cap`. Labels reappear on hover, focus, selection, lit neighbour, search hit (`.qhit`), or when `setView()` marks `#brain.zoomed` (`VB.w < ZOOM_LABEL_W=580`). Only pass notes that actually received a slot (`pos.has(id)`), or the label budget is wasted on overflowed notes. Slot boxes still reserve label space, so revealed labels never overlap.
- **Inspector overview.** `meterGroup()` draws bars only for non-zero counts (plus the current mood); zero-count facets or emotions collapse into a `.chips` line of clickable buttons. Do not reintroduce one bar per bucket.
- **Map controls** live in the `.ctrls` toolbar. Toggles show their state via `aria-pressed` (cyan dot) with short text (`漂浮` / `信号`), and the full state goes in `aria-label`. The session selector `#qSess` belongs inside `.search`.
- **Stability.** Node drift amplitude is 1.3 for memories / 1 for others. Larger values make labels and click targets visibly wobble.
- **Mobile ≤ 640.** `table.lib` collapses into stacked rows (`td[data-label]` prefixes; actions pinned top-right). Add `data-label` to any new numeric column. ≤ 1000: the portrait is a 120px strip.
- **Visual verification.** Use a temporary demo server: a `BrainStore` in a tmp dir, seeded notes, `BrainHttpServer` on a spare port. Screenshot it with `playwright-core` (`channel:'chrome'`) at 1440/1280/900/640/390. Assert `scrollWidth == innerWidth`, the visible `.mem .cap` count, and no console errors.

The persona editor reads `GET /api/personas` and keeps local `editingPersonaId` and `personaBaseline`. A 15-second `load()` must update the list/active indicator without replacing unsaved name or text. Switch or new-entry actions prompt before discarding drafts; saving a non-active entry must not change the active bot persona. The backup button should download the full `/api/export` payload, not synthesize a backup from `/api/state` (which omits version history and digest metadata).

---

## Forbidden Patterns

<!-- Patterns that should never be used and why -->

(To be filled by the team)

---

## Required Patterns

<!-- Patterns that must always be used -->

(To be filled by the team)

---

## Testing Requirements

<!-- What level of testing is expected -->

(To be filled by the team)

---

## Code Review Checklist

<!-- What reviewers should check -->

(To be filled by the team)
