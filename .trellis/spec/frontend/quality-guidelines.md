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

- Emotion: `emotionOps(OPS)` → `matchEmotion(note, emos)` picks the same-session `op:'emotion'` record within `[createdAt-5s, createdAt+10min]`; `emotionBucket(PAD)` maps it to one of five fixed buckets. `load()` fetches `/ops?limit=500` for this; the ops tab only renders the first 150.
- Persona: `personaFacets(text)` splits the active persona on `^## ` (≤6, whole text when no headings); `matchFacet(note, facets)` requires ≥`FACET_MIN` shared letter/number bigrams that appear in fewer than half of the sections.

Pure helpers (`ngrams` … before `function bindMapNode`) are extracted by `test/page.test.ts`; keep new pure functions inside that range and free of DOM access.

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
