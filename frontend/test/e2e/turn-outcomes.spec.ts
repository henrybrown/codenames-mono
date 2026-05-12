import { test as base, expect } from "@playwright/test";
import { setupGameViaApi } from "./fixtures/game-helpers";
import { setAuthCookie } from "./fixtures/dashboard-helpers";
import {
  dismissHandoff,
  clickCard,
  giveClueViaUI,
  clickEndTurn,
  waitForOutcomePanel,
  waitForGameOver,
} from "./fixtures/flow-helpers";

/**
 * Turn outcomes: the six "what happens at end-of-turn" flows.
 *
 * Each test follows a real user path:
 *   API setup → navigate → codemaster handoff → give clue via UI →
 *   codebreaker handoff → click card(s) → assert outcome surface.
 *
 * Card counts in a 25-card board:
 *   first-mover team:  9 cards
 *   other team:        8 cards
 *   bystanders:        7 cards
 *   assassin:          1 card
 */

type GameFixture = {
  game: { gameId: string; cookie: string; gameState: any; firstTeam: string };
};

const test = base.extend<GameFixture>({
  game: async ({ page, request }, use) => {
    const { gameId, cookie, gameState } = await setupGameViaApi(request);
    const token = cookie.replace("authToken=", "");
    await setAuthCookie(page.context(), token);
    const firstTeam = gameState.currentRound.turns[0].teamName;
    await use({ gameId, cookie, gameState, firstTeam });
  },
});

/** Find a card by predicate from gameState. Throws if not found. */
function findCard(
  gameState: any,
  predicate: (card: any) => boolean,
): any {
  const card = gameState.currentRound.cards.find(predicate);
  if (!card) throw new Error("No card matching predicate");
  return card;
}

test("clue 1 → 1 correct card → manual end-turn → outcome panel", async ({ page, game }) => {
  const teamCard = findCard(
    game.gameState,
    (c) => c.cardType === "TEAM" && c.teamName === game.firstTeam,
  );

  await page.goto(`/game/${game.gameId}`);
  await dismissHandoff(page);
  await giveClueViaUI(page, "SIGNAL", 1);
  await dismissHandoff(page);
  await clickCard(page, teamCard.word);

  /** 1+1 = 2 allowed; after 1 correct → 1 left. Turn doesn't auto-end.
   *  Codebreaker manually ends the turn. */
  await clickEndTurn(page);
  await waitForOutcomePanel(page);
  await expect(page.locator("body")).toContainText("SIGNAL");
  await expect(page.locator("body")).toContainText(teamCard.word, { ignoreCase: true });
});

test("clue 1 → other-team card → auto-end → outcome panel", async ({ page, game }) => {
  const otherCard = findCard(
    game.gameState,
    (c) => c.cardType === "TEAM" && c.teamName !== game.firstTeam,
  );

  await page.goto(`/game/${game.gameId}`);
  await dismissHandoff(page);
  await giveClueViaUI(page, "WRONG", 1);
  await dismissHandoff(page);
  await clickCard(page, otherCard.word);

  /** Wrong team card → backend sets guessesRemaining=0 and ends turn. */
  await waitForOutcomePanel(page);
  await expect(page.locator("body")).toContainText(otherCard.word, { ignoreCase: true });
});

test("clue 1 → bystander → auto-end → outcome panel", async ({ page, game }) => {
  const bystander = findCard(game.gameState, (c) => c.cardType === "BYSTANDER");

  await page.goto(`/game/${game.gameId}`);
  await dismissHandoff(page);
  await giveClueViaUI(page, "MAYBE", 1);
  await dismissHandoff(page);
  await clickCard(page, bystander.word);

  await waitForOutcomePanel(page);
  await expect(page.locator("body")).toContainText(bystander.word, { ignoreCase: true });
});

test("clue 2 → correct then wrong → auto-end on wrong", async ({ page, game }) => {
  const teamCard = findCard(
    game.gameState,
    (c) => c.cardType === "TEAM" && c.teamName === game.firstTeam,
  );
  const otherCard = findCard(
    game.gameState,
    (c) => c.cardType === "TEAM" && c.teamName !== game.firstTeam,
  );

  await page.goto(`/game/${game.gameId}`);
  await dismissHandoff(page);
  await giveClueViaUI(page, "MIXED", 2);
  await dismissHandoff(page);

  await clickCard(page, teamCard.word);
  /** Correct → guess remaining drops from 3 → 2. Turn continues. */
  await page.waitForTimeout(1500);
  await clickCard(page, otherCard.word);

  await waitForOutcomePanel(page);
  await expect(page.locator("body")).toContainText(teamCard.word, { ignoreCase: true });
  await expect(page.locator("body")).toContainText(otherCard.word, { ignoreCase: true });
});

test("clue 2 → 3 correct guesses → auto-end on exhausted guesses", async ({ page, game }) => {
  /** Need 3 distinct first-team cards. */
  const teamCards = game.gameState.currentRound.cards
    .filter((c: any) => c.cardType === "TEAM" && c.teamName === game.firstTeam)
    .slice(0, 3);
  expect(teamCards).toHaveLength(3);

  await page.goto(`/game/${game.gameId}`);
  await dismissHandoff(page);
  await giveClueViaUI(page, "OVERCLUE", 2);
  await dismissHandoff(page);

  /** Clue 2 → allowedGuesses = 3. After third correct, backend ends turn. */
  for (const card of teamCards) {
    await clickCard(page, card.word);
    await page.waitForTimeout(1500);
  }

  await waitForOutcomePanel(page);
});

test("clue 1 → assassin → game over (overlay, not outcome panel)", async ({ page, game }) => {
  const assassin = findCard(game.gameState, (c) => c.cardType === "ASSASSIN");

  await page.goto(`/game/${game.gameId}`);
  await dismissHandoff(page);
  await giveClueViaUI(page, "DEATH", 1);
  await dismissHandoff(page);
  await clickCard(page, assassin.word);

  /** Assassin: game ends immediately. GameOverOverlay shows MISSION COMPLETE. */
  const body = await waitForGameOver(page);
  expect(body.toUpperCase()).toContain("MISSION COMPLETE");
});
