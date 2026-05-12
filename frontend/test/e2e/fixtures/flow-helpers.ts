import { type Page, type Locator, expect } from "@playwright/test";
import { openDashboardIfMobile } from "./dashboard-helpers";

/**
 * UI-flow helpers. This module handles user-driven UI interaction + UI assertions.
 *
 * Key constraint: the game page renders multiple dashboard layouts
 * simultaneously (CSS hides one). IDs are intentionally duplicated. Helpers
 * here filter to the visible-in-viewport instance.
 */

/**
 * Find the first visible-and-in-viewport instance of a selector, polling until
 * timeout. Returns null if nothing settles in time.
 *
 * Polls because dashboard layouts settle asynchronously after first paint
 * (refetch on handoff, framer-motion entrances).
 */
export async function findVisible(
  page: Page,
  selector: string,
  timeout = 5000,
): Promise<Locator | null> {
  await page
    .locator(selector)
    .first()
    .waitFor({ state: "attached", timeout })
    .catch(() => null);

  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const all = page.locator(selector);
    const count = await all.count();
    for (let i = count - 1; i >= 0; i--) {
      const el = all.nth(i);
      const visible = await el.isVisible({ timeout: 250 }).catch(() => false);
      if (!visible) continue;
      const inViewport = await el
        .evaluate((node) => {
          const rect = node.getBoundingClientRect();
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            rect.top < window.innerHeight &&
            rect.bottom > 0 &&
            rect.left < window.innerWidth &&
            rect.right > 0
          );
        })
        .catch(() => false);
      if (inViewport) return el;
    }
    await page.waitForTimeout(150);
  }
  return null;
}

/**
 * Dismiss the single-device handoff overlay if present. No-op if not shown
 * (multi-device or already past it).
 *
 * Codebreaker-phase handoff can take a beat to appear: clue submit → API
 * roundtrip → query invalidation → state refetch → handoff mount. The
 * default 8s timeout covers slow CI; raise per call if needed.
 *
 * Waits for state:"detached" rather than state:"hidden" because the dialog
 * card animates scale 1→0 (making the button "hidden" via zero bounding
 * box) while the fixed-position backdrop sibling stays full-size and keeps
 * intercepting pointer events until AnimatePresence completes its exit and
 * unmounts the whole subtree.
 */
export async function dismissHandoff(page: Page, timeout = 10_000): Promise<void> {
  const handoff = page.locator("#handoff-execute-btn");
  /** waitFor polls the locator. isVisible({timeout}) in our Playwright version
   *  doesn't reliably re-poll, so it gave false negatives on the codebreaker
   *  handoff which mounts a beat after the clue-submit response. */
  try {
    await handoff.waitFor({ state: "visible", timeout });
  } catch {
    return; // no handoff appeared — multi-device or already past it
  }
  await handoff.click();
  /** Wait for the dialog to fully unmount (not just go scale:0). The fixed-
   *  position backdrop sibling keeps intercepting pointer events until
   *  AnimatePresence completes its exit and removes the subtree. */
  await handoff.waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
}

/**
 * Click a game card by its word (matches the card's aria-label).
 * Cards may render in multiple layouts — pick whichever is in-viewport.
 */
export async function clickCard(page: Page, cardWord: string): Promise<void> {
  /** Wait for data-clickable=true rather than just attached. After dismissHandoff
   *  the page refetches with the new role; until that lands the card stays in
   *  spymaster/observer mode (data-clickable=false) and the click would race
   *  the refetch. */
  const card = page.locator(`[aria-label="${cardWord}"][data-clickable="true"]`).first();
  await card.waitFor({ state: "visible", timeout: 15_000 });
  await card.scrollIntoViewIfNeeded().catch(() => {});
  await card.click({ force: true });
}

/**
 * Fill the codemaster clue input and submit. Sets count by clicking the +
 * button n-1 times from its default of 1. Opens the mobile drawer first if
 * needed.
 */
export async function giveClueViaUI(
  page: Page,
  word: string,
  count: number,
): Promise<void> {
  await openDashboardIfMobile(page);

  const input = await findVisible(page, "#clue-word-input", 10_000);
  if (!input) throw new Error("Clue input not visible");
  await input.fill(word);

  // Count starts at 1; click + to increment. On mobile the drawer may have
  // closed after the keyboard-style fill, so re-open before each click.
  for (let i = 1; i < count; i++) {
    await openDashboardIfMobile(page);
    /** On mobile the +/- buttons sit below the viewport fold in the compact
     *  dashboard footer. Scrolling doesn't always work (drawer uses
     *  position:fixed inside a hidden-overflow ancestor), so dispatch the
     *  click directly. */
    await page.evaluate(() => {
      const btn = document.querySelector("[aria-label='Increase clue count']") as HTMLButtonElement | null;
      btn?.click();
    });
  }

  // Submit via Enter on the focused input — avoids selecting the wrong
  // submit button when multiple dashboard layouts render duplicate ids and
  // findVisible picks a different instance from the input.
  await input.press("Enter");
}

/**
 * Click the end-turn button (codebreaker view). Opens mobile drawer first.
 */
export async function clickEndTurn(page: Page): Promise<void> {
  await openDashboardIfMobile(page);
  const btn = await findVisible(page, "#end-turn-btn", 10_000);
  if (!btn) throw new Error("End-turn button not visible");
  await btn.click();
}

/**
 * Wait for the turn-outcome panel to appear ("TURN COMPLETE" text). This is
 * the per-turn outcome panel — NOT the game-over overlay.
 */
export async function waitForOutcomePanel(page: Page, timeout = 10_000): Promise<void> {
  await expect(page.locator("body")).toContainText("TURN COMPLETE", { timeout });
}

/**
 * Wait for the game-over overlay (VictoryFlash). Returns the body text at the
 * point it appears so callers can assert winner / team color.
 */
export async function waitForGameOver(page: Page, timeout = 15_000): Promise<string> {
  await expect(page.locator("body")).toContainText("MISSION COMPLETE", { timeout });
  return page.locator("body").innerText();
}

/**
 * Wait for the next turn to actually be active. Used after the 8s NextTurn
 * countdown to confirm the new turn has started. In single-device, also
 * dismisses any handoff overlay that appears.
 */
export async function waitForNextTurn(
  page: Page,
  opts: { singleDevice?: boolean; timeout?: number } = {},
): Promise<void> {
  const { singleDevice = true, timeout = 15_000 } = opts;

  if (singleDevice) {
    // Handoff overlay appears once the NextTurnTrigger has fired and the new
    // turn is active for a different role.
    const handoff = page.locator("#handoff-execute-btn");
    await handoff.waitFor({ state: "visible", timeout });
    await handoff.click();
    await page.waitForTimeout(500);
  } else {
    // Multi-device: no handoff. Just wait for the outcome panel to clear and
    // an end-turn or clue input to appear on the next-team's perspective.
    await expect(page.locator("body")).not.toContainText("TURN COMPLETE", { timeout });
  }
}
