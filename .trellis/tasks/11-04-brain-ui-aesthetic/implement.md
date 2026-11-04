# Implement plan

## Ordered checklist

1. Baseline: keep the current screenshots in `/tmp/brain-demo/before/` (desk 1440 / 1280 / 900, mobile 390).
2. Tokens + type scale + `--faint` contrast (design §1).
3. P0-1 search/session control, P0-2 ctrl nowrap + short toggle text, P0-3 mobile header (§2).
4. `labelPick` pure helper + test in `test/page.test.ts`; `quiet` class in `render()`; `zoomed` toggle in `setView()` (§3).
5. Stage composition: viewBox / VB_HOME, REGIONS nudge, legend + ctrls toolbar (§4). Iterate by screenshot.
6. Inspector overview: non-zero meters + chip line (§5).
7. Lower half: cards, tabs, table actions, shared select style (§6).
8. Mobile: portrait strip, stacked library rows with `data-label` (§7).
9. CSS dedupe (§8).

## Validation

- `cd dsh-qqbot-brain && npm test && npm run typecheck && npm run build` (build syncs `dist/server/page.html`).
- Headless walkthrough with `/tmp/brain-demo/server.ts` + playwright-core `channel:'chrome'`:
  - 1440 / 1280 / 900 / 640 / 390: overview, selected memory, search, every tab, empty library (start the server with no seed).
  - Check: no horizontal overflow (`scrollWidth == innerWidth`), no console errors, ctrl buttons single-line, `#qSess` inside the search box, ≤ 8 memory labels visible at home, labels appear on hover / select / zoom.
  - Mobile zoom regression: double-tap zoom in/out, ＋/－, reset (from `11-04-brain-mobile-ux2`).
  - 15s refresh keeps the selection and an unsaved note edit draft.
- Before/after screenshot pairs shown to the user for sign-off.

## Rollback points

- One commit per logical step is not required; single final commit, reversible with `git revert`.
- Highest-risk change: viewBox/VB_HOME (§4). If the zoom regression fails, revert that step alone and keep the rest.
