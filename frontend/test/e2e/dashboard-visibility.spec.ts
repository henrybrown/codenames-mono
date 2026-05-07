import { test, expect } from "@playwright/test";
import {
  setupGameViaApi,
  giveClue,
  makeGuess,
  getGameState,
  postMessage,
} from "./fixtures/game-helpers";
import { setAuthCookie, openDashboardIfMobile } from "./fixtures/dashboard-helpers";

/**
 * Dismiss the single-device handoff overlay if present.
 */
async function dismissHandoff(page: import("@playwright/test").Page) {
  const handoff = page.locator("#handoff-execute-btn");
  if (await handoff.isVisible({ timeout: 3000 }).catch(() => false)) {
    await handoff.click();
    await page.waitForTimeout(500);
  }
}

/**
 * Find a truly visible instance of a locator — checks both Playwright
 * visibility AND viewport bounds (multiple layouts render simultaneously
 * with CSS hiding one, so isVisible alone isn't enough).
 */
async function findVisible(page: import("@playwright/test").Page, selector: string, timeout = 5000) {
  // Wait for at least one element to exist in DOM first
  await page.locator(selector).first().waitFor({ state: "attached", timeout }).catch(() => null);

  const all = page.locator(selector);
  const count = await all.count();
  for (let i = count - 1; i >= 0; i--) {
    const el = all.nth(i);
    const visible = await el.isVisible({ timeout: 1000 }).catch(() => false);
    if (!visible) continue;
    const inViewport = await el.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 &&
        rect.top < window.innerHeight && rect.bottom > 0 &&
        rect.left < window.innerWidth && rect.right > 0;
    }).catch(() => false);
    if (inViewport) return el;
  }
  return null;
}

// ─── Multi-device: header shows real player name ───────────────────────────

test("multi-device — header shows real player name, never [AI]", async ({
  browser,
  request,
}) => {
  const { gameId, cookie } = await setupGameViaApi(request, {
    gameType: "MULTI_DEVICE",
  });
  const token = cookie.replace("authToken=", "");

  const ctx = await browser.newContext();
  await setAuthCookie(ctx, token);
  const page = await ctx.newPage();
  await page.goto(`/game/${gameId}`);
  await page.waitForTimeout(2000);
  await openDashboardIfMobile(page);

  /** The creator joined as "Alice" — her name should appear in the dashboard */
  const dashboardText = await page.locator("body").innerText();
  expect(dashboardText).toContain("Alice");
  expect(dashboardText).not.toContain("[AI]");

  await ctx.close();
});

// ─── Codemaster clue stage ─────────────────────────────────────────────────

test.skip("codemaster clue stage — clue input visible, no end turn", async ({
  browser,
  request,
}) => {
  const { gameId, cookie } = await setupGameViaApi(request);
  const token = cookie.replace("authToken=", "");

  const ctx = await browser.newContext();
  await setAuthCookie(ctx, token);
  const page = await ctx.newPage();
  await page.goto(`/game/${gameId}?role=CODEMASTER`);
  await dismissHandoff(page);

  // Ensure overlay is fully gone before checking dashboard elements
  await page.locator("._backgroundBlur_1ypl7_13").waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});

  await openDashboardIfMobile(page);
  await page.waitForTimeout(1000);

  /** Clue input should be visible */
  const clueInput = await findVisible(page, "#clue-word-input", 10000);
  expect(clueInput).not.toBeNull();

  /** Chat FAB should be visible */
  const chatFab = await findVisible(page, "[aria-label='Open chat']");
  expect(chatFab).not.toBeNull();

  /** End turn button should NOT be visible */
  const endTurn = await findVisible(page, "#end-turn-btn");
  expect(endTurn).toBeNull();

  await ctx.close();
});

// ─── Codebreaker guess stage ───────────────────────────────────────────────

test("codebreaker guess stage — end turn visible, no clue input", async ({
  browser,
  request,
}) => {
  const { gameId, cookie, gameState } = await setupGameViaApi(request);
  const token = cookie.replace("authToken=", "");

  /** Advance to codebreaker-guess stage by giving a clue */
  await giveClue(request, cookie, gameId, 1, {
    word: "SIGNAL",
    targetCardCount: 1,
    role: "CODEMASTER",
  });

  const ctx = await browser.newContext();
  await setAuthCookie(ctx, token);
  const page = await ctx.newPage();
  await page.goto(`/game/${gameId}?role=CODEBREAKER`);
  await dismissHandoff(page);
  await openDashboardIfMobile(page);
  /** Allow extra time for the post-handoff refetch + dashboard render in CI. */
  await page.waitForTimeout(2500);

  /** End turn button should be visible */
  const endTurn = await findVisible(page, "#end-turn-btn", 10_000);
  expect(endTurn).not.toBeNull();

  /** Chat FAB should be visible */
  const chatFab = await findVisible(page, "[aria-label='Open chat']");
  expect(chatFab).not.toBeNull();

  /** Clue word should appear in the intel panel */
  const bodyText = await page.locator("body").innerText();
  expect(bodyText.toUpperCase()).toContain("SIGNAL");

  /** Clue input should NOT be visible */
  const clueInput = await findVisible(page, "#clue-word-input");
  expect(clueInput).toBeNull();

  await ctx.close();
});

// ─── Game over ─────────────────────────────────────────────────────────────

test("game over — chat FAB visible, controls hidden", async ({
  browser,
  request,
}) => {
  const { gameId, cookie, gameState } = await setupGameViaApi(request);
  const token = cookie.replace("authToken=", "");

  /** Give a clue then guess the assassin to trigger game over */
  await giveClue(request, cookie, gameId, 1, {
    word: "DOOM",
    targetCardCount: 1,
    role: "CODEMASTER",
  });

  const assassinCard = gameState.currentRound.cards.find(
    (c: any) => c.cardType === "ASSASSIN",
  );
  expect(assassinCard).toBeDefined();

  await makeGuess(request, cookie, gameId, 1, {
    cardWord: assassinCard.word,
    role: "CODEBREAKER",
  });

  const ctx = await browser.newContext();
  await setAuthCookie(ctx, token);
  const page = await ctx.newPage();
  await page.goto(`/game/${gameId}?role=CODEBREAKER`);
  await dismissHandoff(page);
  await page.waitForTimeout(3000); // wait for game-over animations

  /** Chat FAB should still be visible */
  const chatFab = await findVisible(page, "[aria-label='Open chat']");
  expect(chatFab).not.toBeNull();

  /** Gameplay controls should be hidden */
  const clueInput = await findVisible(page, "#clue-word-input");
  expect(clueInput).toBeNull();

  const endTurn = await findVisible(page, "#end-turn-btn");
  expect(endTurn).toBeNull();

  await ctx.close();
});

// ─── Chat notification ─────────────────────────────────────────────────────

test.skip("chat notification appears when messages exist, resets on open", async ({
  browser,
  request,
}) => {
  const { gameId, cookie } = await setupGameViaApi(request);
  const token = cookie.replace("authToken=", "");

  /** Post a message via API before navigating */
  await postMessage(request, cookie, gameId, { content: "hello team" });

  const ctx = await browser.newContext();
  await setAuthCookie(ctx, token);
  const page = await ctx.newPage();
  await page.goto(`/game/${gameId}?role=CODEMASTER`);
  await dismissHandoff(page);

  // Ensure any overlay is fully gone before interacting with the dashboard
  await page.locator("._backgroundBlur_1ypl7_13").waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
  await page.locator("#handoff-execute-btn").waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});

  await openDashboardIfMobile(page);
  await page.waitForTimeout(2000);

  /** Chat FAB should show notification dot (yellow circle from ChatNotificationIcon) */
  const fabEl = await findVisible(page, "[aria-label='Open chat']");
  expect(fabEl).not.toBeNull();

  /** The notification icon has a distinctive yellow circle the regular one doesn't.
   *  SVG child elements don't report isVisible reliably, so check via DOM query.
   *  Scope to the visible FAB element to avoid detecting the hidden layout's copy. */
  const fabHandle = await fabEl!.elementHandle();
  const hasNotificationDot = async () =>
    fabHandle!.evaluate((el) =>
      el.querySelectorAll("circle[fill*='e8c454'], circle[fill*='color-warning']").length > 0,
    );
  expect(await hasNotificationDot()).toBe(true);

  /** Open chat to reset unread */
  await fabEl!.click({ force: true });
  await page.waitForTimeout(1000);

  /** Close chat */
  const closeBtn = page.locator("[aria-label='Collapse chat']");
  if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await closeBtn.click({ force: true });
    await page.waitForTimeout(1000);
  }

  /** Notification dot should be gone on this FAB instance —
   *  re-query the FAB since the DOM may have re-rendered */
  const fabAfter = await findVisible(page, "[aria-label='Open chat']");
  if (fabAfter) {
    const fabHandleAfter = await fabAfter.elementHandle();
    const dotGone = await fabHandleAfter!.evaluate((el) =>
      el.querySelectorAll("circle[fill*='e8c454'], circle[fill*='color-warning']").length === 0,
    );
    expect(dotGone).toBe(true);
  } else {
    // Chat FAB might still be in "close" state — notification is cleared either way
    expect(await hasNotificationDot()).toBe(false);
  }

  await ctx.close();
});
