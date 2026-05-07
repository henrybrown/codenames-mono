import { test, expect } from "@playwright/test";
import { setupGameViaApi, getGameState, giveClue } from "./fixtures/game-helpers";
import { setAuthCookie } from "./fixtures/dashboard-helpers";

/**
 * Turn transitions: wrong guess ends turn and switches to other team.
 */
test("bystander guess ends turn and switches to other team", async ({ page, context, request }) => {
  const { gameId, cookie, gameState } = await setupGameViaApi(request);

  const cards = gameState.currentRound.cards;
  const bystanderCard = cards.find((c: any) => c.cardType === "BYSTANDER");
  expect(bystanderCard).toBeDefined();
  const bystanderWord = bystanderCard.word;

  const firstTurn = gameState.currentRound.turns?.[0];
  const firstTeam = firstTurn?.teamName;

  /** Give clue via API */
  await giveClue(request, cookie, gameId, 1, {
    word: "XYZZY",
    targetCardCount: 1,
    role: "CODEMASTER",
  });

  /** Set API auth cookie in browser */
  const token = cookie.replace("authToken=", "");
  await setAuthCookie(context, token);

  await page.goto(`/game/${gameId}?role=CODEBREAKER`);
  await page.waitForTimeout(3000);

  /** Dismiss handoff if present */
  const handoffBtn = page.locator("#handoff-execute-btn");
  if (await handoffBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await handoffBtn.click();
    await page.waitForTimeout(500);
  }

  /** Click the bystander card */
  const bystanderEl = page.locator(`[aria-label="${bystanderWord}"]`);
  await expect(bystanderEl).toBeVisible({ timeout: 10_000 });
  await bystanderEl.click();

  /** Backend ends the turn but no longer auto-starts the next one — the
   *  frontend's NextTurnTrigger fires startTurn after an 8s countdown.
   *  Wait long enough for the countdown + mutation to complete. */
  await page.waitForTimeout(11_000);

  /** Verify via API that turn switched */
  const updatedState = await getGameState(request, cookie, gameId);
  const turns = updatedState.currentRound.turns;

  expect(turns.length).toBeGreaterThanOrEqual(2);
  const completedTurn = turns.find((t: any) => t.status === "COMPLETED");
  expect(completedTurn).toBeDefined();
  expect(completedTurn.teamName).toBe(firstTeam);

  const activeTurn = turns.find((t: any) => t.status === "ACTIVE");
  expect(activeTurn).toBeDefined();
  expect(activeTurn.teamName).not.toBe(firstTeam);
});

test("other team card guess ends turn and switches teams", async ({ page, context, request }) => {
  const { gameId, cookie, gameState } = await setupGameViaApi(request);

  const cards = gameState.currentRound.cards;
  const firstTurn = gameState.currentRound.turns?.[0];
  const firstTeamName = firstTurn?.teamName;

  const otherTeamCard = cards.find(
    (c: any) => c.cardType === "TEAM" && c.teamName !== firstTeamName,
  );
  expect(otherTeamCard).toBeDefined();

  await giveClue(request, cookie, gameId, 1, {
    word: "XYZZY",
    targetCardCount: 1,
    role: "CODEMASTER",
  });

  const token = cookie.replace("authToken=", "");
  await setAuthCookie(context, token);

  await page.goto(`/game/${gameId}?role=CODEBREAKER`);
  await page.waitForTimeout(3000);

  const handoffBtn = page.locator("#handoff-execute-btn");
  if (await handoffBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await handoffBtn.click();
    await page.waitForTimeout(500);
  }

  const cardEl = page.locator(`[aria-label="${otherTeamCard.word}"]`);
  await expect(cardEl).toBeVisible({ timeout: 10_000 });
  await cardEl.click();

  /** Backend ends the turn but no longer auto-starts the next one — the
   *  frontend's NextTurnTrigger fires startTurn after an 8s countdown. */
  await page.waitForTimeout(11_000);

  const updatedState = await getGameState(request, cookie, gameId);
  const activeTurn = updatedState.currentRound.turns.find((t: any) => t.status === "ACTIVE");
  expect(activeTurn).toBeDefined();
  expect(activeTurn.teamName).not.toBe(firstTeamName);
});
