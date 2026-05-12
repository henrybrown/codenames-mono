# E2E Test Plan — User-Flow Refocus

Goal: replace the current 9-file, ~1,400-line e2e suite with a small set of vertical user-flow tests. Each test asserts a thing a real user actually experiences end-to-end (UI → API → UI), not a synthetic invariant.

---

## 1. Audit — current state

### What's there now

| File | LOC | Tests | Verdict |
|---|---:|---:|---|
| `clue-input-autofocus.spec.ts` | 59 | 2 (both `test.skip`) | **delete** — unit test concern |
| `dashboard-turn-stability.spec.ts` | 445 | 6 | **drop 3, keep 1 reframed** — MutationObserver flash detection is a regression test for a fixed bug, not a user flow |
| `dashboard-visibility.spec.ts` | 272 | 5 (2 skipped) | **collapse into flow tests** — visibility-of-X micro-asserts |
| `game-setup-flow.spec.ts` | 193 | 3 | **keep, condense** — actual user flow |
| `multi-device-game.spec.ts` | 80 | 2 | **drop one, keep one** — "two contexts see board" is fine; "guess via API selects card" duplicates multi-device-websocket-sync |
| `multi-device-websocket-sync.spec.ts` | 59 | 2 | **drop** — API-only, no UI assertion. Backend integration tests cover this |
| `single-device-assassin.spec.ts` | 71 | 2 | **collapse** — fold into assassin user flow |
| `single-device-full-game.spec.ts` | 149 | 1 | **keep, condense** — the only test that walks the whole real path |
| `single-device-turn-transitions.spec.ts` | 106 | 2 | **collapse** — duplicates dashboard-turn-stability's transition assertions with worse coverage |

### What gets tested redundantly today

- "Outcome panel visible after X guess" — asserted 3 times (turn-stability:276, turn-stability:331, turn-stability:383)
- "Turn switched teams" — asserted 4 times (turn-transitions:8, turn-transitions:64, full-game:24, multi-device:36)
- "Card visible / selected on board" — 5 places (game-setup:126, multi-device:8, multi-device:36, full-game:24, assassin:36)
- "Dashboard / chat FAB visible" — 4 places (visibility:118, visibility:162, turn-stability:148, turn-stability:202)

### What's untested today

- **Correct guess that continues the turn** (clue 2, guess one correct card → turn stays). Every turn-outcome test ends the turn.
- **Over-guessing**: clue 2 → 3 correct guesses → forced turn end (guesses run out).
- **Single-device handoff appearance** at turn transition (every test dismisses it via `dismissHandoff` and moves on — no test asserts it *appears* with the right next role/team).
- **Multi-device live update** when team A's clue/guess fires in team B's browser (websocket sync is API-asserted only).
- **AI trigger button** visibility, click → thinking dot → clue/guess landing in chat (covered nowhere).
- **AI in single-device handoff mode** (`AI-turn-overlay.tsx`) — never tested.
- **Game-over overlay / VictoryFlash** appears on the final team card (only assassin path is loosely tested).

---

## 2. Proposed test suite

**Principles:**
1. One test per user flow, not per assertion.
2. API setup is fine (`setupGameViaApi`) — it's not what we're testing. UI is what we assert.
3. Every test ends with a UI-visible state, not an API state check.
4. No `waitForTimeout` longer than 3s without a comment explaining what's settling. For the 8s NextTurn countdown, use the actual UI signal (DotCountdown disappears, next turn's End-Turn button appears).
5. Skip retries (`retries: 0`) — flakes are bugs.
6. Drop the `tablet` Playwright project. Keep `desktop` + `mobile`; map flows to whichever viewport actually exercises the interesting code path (handoff drawer on mobile, sidebar on desktop).

### File structure (new)

```
frontend/test/e2e/
├── fixtures/
│   ├── game-helpers.ts          # unchanged
│   ├── dashboard-helpers.ts     # unchanged
│   └── flow-helpers.ts          # NEW — UI helpers: clickCard, waitForOutcomePanel, waitForNextTurn, dismissHandoff (move from dashboard-turn-stability)
├── 01-setup-flow.spec.ts        # condensed from game-setup-flow
├── 02-turn-outcomes.spec.ts     # the 6 turn-outcome flows you described
├── 03-turn-transitions.spec.ts  # next-turn handoff (single) vs live update (multi)
└── 06-game-over.spec.ts         # assassin + final-team-card endings
└── playwright.config.ts
```

4 files, ~16 tests in this pass. AI flows (04 + 05) deferred — see §2.4.

---

### 2.1 `01-setup-flow.spec.ts` (4 tests)

| # | Name | Flow | Viewport |
|---|---|---|---|
| 1 | single-device setup completes to game start | auth → setup (single-device, AI off) → lobby (drag 4 players, 2 teams) → start → first turn renders | desktop |
| 2 | multi-device setup with two browser contexts | host creates → second context joins via game URL → both see same lobby state → host starts → both contexts see codemaster/codebreaker views | desktop |
| 3 | start button disabled until quorum | enter lobby → start disabled → add 1 player → still disabled → add 4 across 2 teams → enabled | desktop |
| 4 | single-device with AI mode toggled | auth → setup → flip AI toggle → create → lobby auto-fills AI slots → start | desktop |

Drops: `game-setup-flow.spec.ts:126` "two contexts view the same game" — folded into #2 above. Card-count check from current line 49 stays in #1.

---

### 2.2 `02-turn-outcomes.spec.ts` (6 tests — **the core of what you asked for**)

All use single-device + desktop unless noted. Each test follows: setup → give clue via UI → guess via UI → assert outcome panel state.

| # | Name | Clue | Guesses (in order) | Asserted outcome panel content |
|---|---|---:|---|---|
| 1 | one correct card ends turn naturally (clue 1) | 1 | correct team card | "TURN COMPLETE", clue word, 1 correct guess shown, ends within countdown |
| 2 | wrong card (other team) ends turn | 1 | other team card | "TURN COMPLETE", wrong outcome marker |
| 3 | bystander ends turn | 1 | bystander | "TURN COMPLETE", bystander marker |
| 4 | correct then wrong ends turn mid-clue | 2 | correct → wrong | both cards listed, turn ends on wrong |
| 5 | over-clue: 3 correct guesses on clue 2 | 2 | correct → correct → correct | all 3 listed, turn ends when guesses exhausted (clue.number + 1) |
| 6 | assassin ends game | 1 | assassin | GameOverOverlay shown, victory color = opposing team, dashboard hidden |

**Note on #5**: the rules give `clue.number + 1` guesses. So clue 2 → 3 max guesses. After the third correct guess, turn auto-ends. This catches the "guesses remaining" boundary that nothing tests today.

**Note on #6**: this is the only test that goes to `GameOverOverlay`. Asserts it's a different surface from the per-turn outcome panel.

---

### 2.3 `03-turn-transitions.spec.ts` (4 tests)

The handoff between turns. This is where single-device and multi-device behave differently — the whole reason single-device-vs-multi-device matters at all.

| # | Name | Mode | Flow |
|---|---|---|---|
| 1 | single-device shows handoff overlay for next turn | SINGLE_DEVICE, desktop | clue → bystander → turn ends → 8s countdown → DeviceHandoffOverlay appears showing "Team Blue Codemaster" → click EXECUTE → next turn's codemaster view loads |
| 2 | single-device handoff on mobile uses drawer | SINGLE_DEVICE, mobile | same as #1 but compact dashboard, asserts handoff appears via mobile path |
| 3 | multi-device updates both browsers on turn end | MULTI_DEVICE, desktop, 2 contexts | clue from team A codemaster → team A codebreaker guesses other-team card → both contexts see turn end + team B becomes active, no handoff overlay anywhere |
| 4 | NextTurnTrigger fires after 8s with no input | SINGLE_DEVICE | turn ends → user does nothing → after 8s, next turn auto-starts (assert via active turn change, no manual click) |

**Drops:** `dashboard-turn-stability.spec.ts:54` (the MutationObserver flash test). It was a regression test for a fixed bug. If we care about no-flash, frame it as: "during transition, end-turn button doesn't disappear-then-reappear" — but that's a perf assertion, not a user flow. Recommend deleting or moving to a separate "regressions/" folder.

---

### 2.4 AI flows — deferred

`04-ai-single-device.spec.ts` and `05-ai-multi-device.spec.ts` are deliberately not in this pass.

Reason: no mock LLM provider exists. `LLM_PROVIDER` is a closed enum (`gemini|openai|anthropic|ollama`); CI sets `LLM_PROVIDER=ollama` + `LLM_MODEL=test` pointing at `http://localhost:11434` which doesn't exist in CI, so any AI call currently fails. The AI pipeline also has hard-coded `await delay(5000)` between guesses (see `ai-player.service.ts`), which would balloon test runtime.

Before AI e2e tests can be added, a follow-up needs to land:
- New `"test"` LLM provider (or extension of existing providers) that parses board state from the prompt and emits deterministic stub responses keyed off `friendlyWords[0]` etc.
- `delay()` shim that honors an env flag in test mode (e.g. `AI_FAST_MODE=true` → no inter-guess sleep).

Out of scope for this cleanup PR.

---

### 2.5 `06-game-over.spec.ts` (2 tests)

| # | Name | Flow |
|---|---|---|
| 1 | game ends on last team card revealed | clue with `targetCardCount` set so reveals match remaining team cards → final correct guess triggers GameOverOverlay (not turn outcome panel) → VictoryFlash animates with winning team color → dashboard shows final score after flash |
| 2 | game ends on assassin reveal | clue → assassin guess → GameOverOverlay shows opposing team as winner |

Note: #2 overlaps with `02-turn-outcomes.spec.ts:6`. Decision: keep both — outcomes spec asserts the per-turn outcome panel doesn't appear, game-over spec asserts the GameOverOverlay does. They check different surfaces from the same trigger.

---

## 3. Helpers to extract

Move from `dashboard-turn-stability.spec.ts` into a new `fixtures/flow-helpers.ts`:

```ts
export async function clickCard(page, cardWord): Promise<void>
export async function giveClueViaUI(page, word, count): Promise<void>
export async function waitForOutcomePanel(page): Promise<void>            // body contains "TURN COMPLETE"
export async function waitForGameOver(page): Promise<{ winner: string }>  // GameOverOverlay appears, returns winning team
export async function waitForNextTurn(page, opts?: { fromHandoff?: boolean }): Promise<void>
export async function dismissHandoff(page): Promise<void>                 // already exists, lift it out
export async function findVisible(page, selector, timeout?): Promise<Locator | null>  // already exists, lift it out
```

Existing `game-helpers.ts` API helpers stay as-is — useful for setup, but tests should reach for UI helpers above for assertions.

---

## 4. Config changes

`frontend/test/e2e/playwright.config.ts`:

```ts
export default defineConfig({
  testDir: ".",
  timeout: 90_000,          // up from 60s — handoff flows include the 8s NextTurn wait
  expect: { timeout: 10_000 },
  fullyParallel: true,      // was false — flows are self-contained, share only the backend
  retries: 0,
  workers: process.env.CI ? 1 : 4,  // local devs want speed; CI stays serial for log determinism
  reporter: "list",
  use: {
    baseURL: "http://localhost:8000",
    headless: true,
    actionTimeout: 10_000,
  },
  projects: [
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1280, height: 800 } } },
    // mobile + tablet projects dropped. Mobile-specific layout testing
    // happens inline within the desktop project via page.setViewportSize()
    // — see `03-turn-transitions.spec.ts`. A dedicated mobile project
    // requires helper rework for the compact-dashboard drawer (off-viewport
    // controls, overlay interception).
  ],
});
```

---

## 5. Migration order

Do this in a single PR. Order matters because some files reference the helpers:

1. Create `fixtures/flow-helpers.ts` with `dismissHandoff`, `findVisible`, `clickCard`, `waitForOutcomePanel`, `waitForGameOver`, `waitForNextTurn`. Lift from `dashboard-turn-stability.spec.ts`.
2. Write the 6 new spec files (`01-`...`06-`).
3. Delete the 9 old spec files.
4. Update `playwright.config.ts` (workers, projects, timeout).
5. Run the full new suite locally on `desktop` and `mobile` projects. Each test must pass 3× in a row.
6. CI run.

---

## 6. Open questions before implementation

- **Multi-device parallelism**: `03-turn-transitions.spec.ts:3` (multi-device live update) opens 2 browser contexts inside one test. With `fullyParallel: true` other tests are also running. Should be fine since each test makes its own game, but worth flagging.
- **Game-over flash timing**: `GAME_OVER_TIMING.FLASH_TOTAL` — what's its value? Tests will need to know this to wait correctly without `waitForTimeout`.
- **NextTurnTrigger countdown is 8s**: that's a lot of dead time per test. Going to eat the wall-clock time for this pass (~50s extra in the suite); a `DEBUG_FAST_COUNTDOWN` flag or `page.clock.runFor()` (Playwright fake clock) can land later if it hurts.

---

## 7. Out of scope (deliberately)

- Performance regressions (no flash, no flicker, no excessive refetch) — these live in a "regressions/" folder if they live in e2e at all. Most belong as component-level tests or in production telemetry, not e2e.
- Visibility micro-tests (clue-input visible, end-turn visible, autofocus). These are component tests, not user flows.
- API-only websocket sync tests — they're integration tests masquerading as e2e. Move to `backend/test/` if not already covered there.

---

## 8. Outcome (implemented)

**Final shape:** 4 spec files, 15 tests, ~660 LOC total (down from 9 files / ~1400 LOC).

```
frontend/test/e2e/
├── fixtures/
│   ├── game-helpers.ts          # extended with setupMultiDeviceGame
│   ├── dashboard-helpers.ts     # unchanged
│   └── flow-helpers.ts          # NEW
├── 01-setup-flow.spec.ts        # 4 tests
├── 02-turn-outcomes.spec.ts     # 6 tests
├── 03-turn-transitions.spec.ts  # 3 tests
└── 06-game-over.spec.ts         # 2 tests
```

Frontend tweaks needed to give tests stable hooks:
- `toggle-switch.tsx`: added optional `id` prop.
- `setup-scene.tsx`: pass `id="ai-mode-toggle"` to the AI ToggleSwitch.

**Runtime:** 25s with 4 workers (down from ~10 min serial on previous suite, ~1.4 min serial on new suite). Stable across 3 consecutive full runs (15/15 each).

**Helper quirks worth knowing for follow-up work:**
- `dismissHandoff` uses `waitFor({state: "visible"})` instead of `isVisible({timeout})` — the latter doesn't reliably re-poll in our Playwright version, giving false negatives on the codebreaker handoff that mounts a beat after the clue-submit response.
- `dismissHandoff` then waits for `state: "detached"` (not `"hidden"`) before returning. The handoff dialog animates `scale 0 → 1` (so the button locator becomes "hidden" via zero bounding box quickly), but its fixed-position backdrop sibling stays full-size and keeps intercepting pointer events until AnimatePresence finishes its exit and removes the subtree.
- `clickCard` waits for `[aria-label="${word}"][data-clickable="true"]` instead of just attached. After dismissing a handoff, the page refetches with the new role; until that lands, cards stay in spymaster/observer mode and a click would race the refetch.
- `giveClueViaUI` submits via `input.press("Enter")` rather than clicking a separate submit button. Multiple dashboard layouts can render duplicate IDs simultaneously (stacked + compact); a `findVisible`-resolved submit button might come from a different instance than the input, hitting an empty-state submission. Enter on the focused input always submits the form it belongs to.
- The `+` count button is incremented via `page.evaluate(() => btn.click())` rather than Playwright's actionability-checked click — the button sits below the viewport fold on the mobile compact dashboard, and `scrollIntoViewIfNeeded` doesn't reliably scroll inside `position:fixed` drawers.
