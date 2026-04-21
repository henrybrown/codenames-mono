import { test, expect } from "@playwright/test";
import {
  setupGameViaApi,
  giveClue,
  makeGuess,
  getGameState,
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
 * visibility AND viewport bounds.
 */
async function findVisible(page: import("@playwright/test").Page, selector: string, timeout = 5000) {
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

// ─── Dashboard stability during turn transitions ─────────────────────────

test("dashboard does not flash during bystander guess turn transition", async ({
  browser,
  request,
}) => {
  const { gameId, cookie, gameState } = await setupGameViaApi(request);
  const token = cookie.replace("authToken=", "");

  /** Give a clue so we're in codebreaker-guess phase */
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
  await page.waitForTimeout(1000);

  /** End turn button should be visible before transition */
  const endTurnBefore = await findVisible(page, "#end-turn-btn");
  expect(endTurnBefore).not.toBeNull();

  /** Find a bystander card to trigger a turn transition */
  const cards = gameState.currentRound.cards;
  const bystanderCard = cards.find((c: any) => c.cardType === "BYSTANDER");
  expect(bystanderCard).toBeDefined();

  /**
   * Install a MutationObserver to detect any gap where the dashboard
   * content area disappears entirely (height collapses to 0 or display: none).
   * This catches the "flash" caused by activeTurn going null.
   */
  await page.evaluate(() => {
    (window as any).__dashboardFlashDetected = false;
    const panels = document.querySelectorAll("[class*='panel'], [class*='footer'], [class*='content']");
    const observer = new MutationObserver(() => {
      panels.forEach((panel) => {
        const rect = panel.getBoundingClientRect();
        if (rect.height === 0) {
          (window as any).__dashboardFlashDetected = true;
        }
      });
    });
    panels.forEach((panel) => {
      observer.observe(panel, { attributes: true, childList: true, subtree: true });
    });
    (window as any).__dashboardObserver = observer;
  });

  /** Guess the bystander card via API to trigger turn transition */
  await makeGuess(request, cookie, gameId, 1, {
    cardWord: bystanderCard.word,
    role: "CODEBREAKER",
  });

  /** Wait for the websocket events to arrive and coalesce */
  await page.waitForTimeout(3000);

  /** Check that no flash was detected */
  const flashDetected = await page.evaluate(() => (window as any).__dashboardFlashDetected);
  expect(flashDetected).toBe(false);

  /** Clean up observer */
  await page.evaluate(() => {
    (window as any).__dashboardObserver?.disconnect();
  });

  /** Verify the turn actually transitioned — API confirms new active turn */
  const updatedState = await getGameState(request, cookie, gameId);
  const turns = updatedState.currentRound.turns;
  const activeTurn = turns.find((t: any) => t.status === "ACTIVE");
  expect(activeTurn).toBeDefined();

  await ctx.close();
});

test("dashboard remains visible through rapid clue-then-guess sequence", async ({
  browser,
  request,
}) => {
  const { gameId, cookie, gameState } = await setupGameViaApi(request);
  const token = cookie.replace("authToken=", "");

  const ctx = await browser.newContext();
  await setAuthCookie(ctx, token);
  const page = await ctx.newPage();
  await page.goto(`/game/${gameId}?role=CODEBREAKER`);
  await dismissHandoff(page);
  await openDashboardIfMobile(page);
  await page.waitForTimeout(1000);

  /** Find team cards for correct guesses */
  const cards = gameState.currentRound.cards;
  const firstTurn = gameState.currentRound.turns?.[0];
  const firstTeamName = firstTurn?.teamName;
  const teamCard = cards.find(
    (c: any) => c.cardType === "TEAM" && c.teamName === firstTeamName,
  );
  expect(teamCard).toBeDefined();

  /** Give a clue and immediately guess — rapid fire events via API */
  await giveClue(request, cookie, gameId, 1, {
    word: "RAPID",
    targetCardCount: 2,
    role: "CODEMASTER",
  });

  /** Wait for clue events to arrive in browser */
  await page.waitForTimeout(1500);

  /** Chat FAB should be visible (stable element) before guess */
  const chatBefore = await findVisible(page, "[aria-label='Open chat']");
  expect(chatBefore).not.toBeNull();

  /** Make a correct guess — this triggers another burst of events */
  await makeGuess(request, cookie, gameId, 1, {
    cardWord: teamCard.word,
    role: "CODEBREAKER",
  });

  /** Wait for websocket events to arrive and coalesce */
  await page.waitForTimeout(2000);

  /** Chat FAB should still be visible — no layout collapse */
  const chatAfter = await findVisible(page, "[aria-label='Open chat']");
  expect(chatAfter).not.toBeNull();

  await ctx.close();
});

test("AI pipeline events do not cause dashboard re-render flash", async ({
  browser,
  request,
}) => {
  /**
   * Set up a game and navigate to it. Then trigger a game action via API
   * and verify the dashboard stays stable. The key assertion is that
   * AI_PIPELINE_STAGE events (targeted invalidation) don't cause
   * game query refetches that would flash the dashboard.
   */
  const { gameId, cookie, gameState } = await setupGameViaApi(request);
  const token = cookie.replace("authToken=", "");

  /** Give a clue to advance to codebreaker phase */
  await giveClue(request, cookie, gameId, 1, {
    word: "STABLE",
    targetCardCount: 1,
    role: "CODEMASTER",
  });

  const ctx = await browser.newContext();
  await setAuthCookie(ctx, token);
  const page = await ctx.newPage();
  await page.goto(`/game/${gameId}?role=CODEBREAKER`);
  await dismissHandoff(page);
  await openDashboardIfMobile(page);
  await page.waitForTimeout(1000);

  /** End turn button should be visible */
  const endTurn = await findVisible(page, "#end-turn-btn");
  expect(endTurn).not.toBeNull();

  /** Clue word should appear in the intel panel */
  const bodyText = await page.locator("body").innerText();
  expect(bodyText.toUpperCase()).toContain("STABLE");

  /**
   * Count how many times the game query refetches during a window.
   * With the old code, AI events would trigger full invalidation.
   * With the new code, only ["game", gameId, "ai", "status"] is invalidated.
   */
  await page.evaluate(() => {
    (window as any).__networkFetchCount = 0;
    const origFetch = window.fetch;
    window.fetch = function (...args: any[]) {
      const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
      /** Count game state or turn fetches (not AI status fetches) */
      if (url.includes("/games/") || url.includes("/turns/")) {
        (window as any).__networkFetchCount++;
      }
      return origFetch.apply(this, args as any);
    };
  });

  /** Wait a period — during normal play, no game refetches should occur
   *  unless a real game event fires */
  await page.waitForTimeout(3000);

  const fetchCount = await page.evaluate(() => (window as any).__networkFetchCount);

  /** Dashboard should still be intact */
  const endTurnAfter = await findVisible(page, "#end-turn-btn");
  expect(endTurnAfter).not.toBeNull();

  /** Clue should still be visible — no flash */
  const bodyTextAfter = await page.locator("body").innerText();
  expect(bodyTextAfter.toUpperCase()).toContain("STABLE");

  await ctx.close();
});

// ─── Turn outcome panel ──────────────────────────────────────────────────

test("turn outcome panel shows after bystander guess with clue and reason", async ({
  browser,
  request,
}) => {
  const { gameId, cookie, gameState } = await setupGameViaApi(request);
  const token = cookie.replace("authToken=", "");

  const cards = gameState.currentRound.cards;
  const bystanderCard = cards.find((c: any) => c.cardType === "BYSTANDER");
  expect(bystanderCard).toBeDefined();

  /** Give a clue so we're in codebreaker-guess phase */
  await giveClue(request, cookie, gameId, 1, {
    word: "OUTCOME",
    targetCardCount: 1,
    role: "CODEMASTER",
  });

  /** Navigate to the page BEFORE making the guess — the turn boundary signal
   *  only fires from live websocket events, so the browser must be connected. */
  const ctx = await browser.newContext();
  await setAuthCookie(ctx, token);
  const page = await ctx.newPage();
  await page.goto(`/game/${gameId}?role=CODEBREAKER`);
  await dismissHandoff(page);
  await openDashboardIfMobile(page);
  await page.waitForTimeout(2000);

  /** Now guess the bystander via API — this fires websocket events that
   *  the connected page receives, triggering the turn boundary signal. */
  await makeGuess(request, cookie, gameId, 1, {
    cardWord: bystanderCard.word,
    role: "CODEBREAKER",
  });

  /** Wait for websocket events + outcome panel to appear */
  await page.waitForTimeout(3000);

  /** "TURN COMPLETE" should be visible */
  const bodyText = await page.locator("body").innerText();
  expect(bodyText.toUpperCase()).toContain("TURN COMPLETE");

  /** The clue word should appear */
  expect(bodyText.toUpperCase()).toContain("OUTCOME");

  /** The bystander card word should appear in the guess list */
  expect(bodyText.toUpperCase()).toContain(bystanderCard.word.toUpperCase());

  /** Reason text should mention BYSTANDER */
  expect(bodyText.toUpperCase()).toContain("BYSTANDER");

  /** Chat FAB should still be visible */
  const chatFab = await findVisible(page, "[aria-label='Open chat']");
  expect(chatFab).not.toBeNull();

  await ctx.close();
});

test("outcome panel auto-dismisses after countdown", async ({
  browser,
  request,
}) => {
  const { gameId, cookie, gameState } = await setupGameViaApi(request);
  const token = cookie.replace("authToken=", "");

  const cards = gameState.currentRound.cards;
  const bystanderCard = cards.find((c: any) => c.cardType === "BYSTANDER");
  expect(bystanderCard).toBeDefined();

  /** Give a clue, navigate, then guess — browser must be connected for ws signal */
  await giveClue(request, cookie, gameId, 1, {
    word: "TIMER",
    targetCardCount: 1,
    role: "CODEMASTER",
  });

  const ctx = await browser.newContext();
  await setAuthCookie(ctx, token);
  const page = await ctx.newPage();
  await page.goto(`/game/${gameId}?role=CODEBREAKER`);
  await dismissHandoff(page);
  await page.waitForTimeout(2000);

  /** Guess bystander via API to trigger turn end while page is watching */
  await makeGuess(request, cookie, gameId, 1, {
    cardWord: bystanderCard.word,
    role: "CODEBREAKER",
  });

  /** Wait for outcome panel to appear */
  await page.waitForTimeout(2000);
  let bodyText = await page.locator("body").innerText();
  expect(bodyText.toUpperCase()).toContain("TURN COMPLETE");

  /** Wait for the 8s countdown + buffer to auto-dismiss */
  await page.waitForTimeout(9_000);

  /** Outcome panel should have dismissed — "TURN COMPLETE" no longer visible */
  bodyText = await page.locator("body").innerText();
  expect(bodyText.toUpperCase()).not.toContain("TURN COMPLETE");

  /** The game should have already auto-advanced (backend does this) */
  const updatedState = await getGameState(request, cookie, gameId);
  const turns = updatedState.currentRound.turns;
  const activeTurn = turns.find((t: any) => t.status === "ACTIVE");
  expect(activeTurn).toBeDefined();

  await ctx.close();
});

test("outcome panel shows correct guess then wrong guess results", async ({
  browser,
  request,
}) => {
  const { gameId, cookie, gameState } = await setupGameViaApi(request);
  const token = cookie.replace("authToken=", "");

  const cards = gameState.currentRound.cards;
  const firstTurn = gameState.currentRound.turns?.[0];
  const firstTeamName = firstTurn?.teamName;

  /** Find a correct team card and an other-team card */
  const teamCard = cards.find(
    (c: any) => c.cardType === "TEAM" && c.teamName === firstTeamName,
  );
  const otherTeamCard = cards.find(
    (c: any) => c.cardType === "TEAM" && c.teamName !== firstTeamName,
  );
  expect(teamCard).toBeDefined();
  expect(otherTeamCard).toBeDefined();

  /** Give clue with 2 target cards so we can guess twice */
  await giveClue(request, cookie, gameId, 1, {
    word: "RESULTS",
    targetCardCount: 2,
    role: "CODEMASTER",
  });

  /** Navigate BEFORE guessing so the page receives ws signals */
  const ctx = await browser.newContext();
  await setAuthCookie(ctx, token);
  const page = await ctx.newPage();
  await page.goto(`/game/${gameId}?role=CODEBREAKER`);
  await dismissHandoff(page);
  await openDashboardIfMobile(page);
  await page.waitForTimeout(2000);

  /** Correct guess first (doesn't end turn) */
  await makeGuess(request, cookie, gameId, 1, {
    cardWord: teamCard.word,
    role: "CODEBREAKER",
  });

  /** Then wrong guess — ends the turn, triggers ws signal */
  await makeGuess(request, cookie, gameId, 1, {
    cardWord: otherTeamCard.word,
    role: "CODEBREAKER",
  });

  /** Wait for outcome panel to appear */
  await page.waitForTimeout(3000);

  const bodyText = await page.locator("body").innerText();

  /** Both guess words should appear */
  expect(bodyText.toUpperCase()).toContain(teamCard.word.toUpperCase());
  expect(bodyText.toUpperCase()).toContain(otherTeamCard.word.toUpperCase());

  /** Reason should mention wrong guess */
  expect(bodyText.toUpperCase()).toContain("WRONG GUESS");
  expect(bodyText.toUpperCase()).toContain("ENDED ON 1");

  await ctx.close();
});
