import { test, expect } from "@playwright/test";
import {
  setupGameViaApi,
  giveClue,
  makeGuess,
} from "./fixtures/game-helpers";
import { setAuthCookie } from "./fixtures/dashboard-helpers";
import {
  dismissHandoff,
  clickCard,
  waitForGameOver,
} from "./fixtures/flow-helpers";

/**
 * Game-over flows. Covers the GameOverOverlay / VictoryFlash surface that
 * replaces per-turn outcome state when the game ends.
 *
 * Game format is QUICK by default: winning the round wins the game.
 */

test("last team card revealed → current team wins → game over", async ({ page, request }) => {
  const { gameId, cookie, gameState } = await setupGameViaApi(request);
  const token = cookie.replace("authToken=", "");
  await setAuthCookie(page.context(), token);

  const firstTeam = gameState.currentRound.turns[0].teamName;
  const teamCards = gameState.currentRound.cards.filter(
    (c: any) => c.cardType === "TEAM" && c.teamName === firstTeam,
  );
  expect(teamCards.length).toBeGreaterThanOrEqual(8); // first-mover team has 8-9 cards

  /** Clue 8 allows 9 guesses — enough for all of the first team's cards.
   *  Drive the first n-1 via API; do the final, game-ending guess in the UI
   *  so the browser is the one observing the GameOverOverlay transition. */
  await giveClue(request, cookie, gameId, 1, {
    word: "WINALL",
    targetCardCount: Math.min(8, teamCards.length - 1),
    role: "CODEMASTER",
  });

  for (let i = 0; i < teamCards.length - 1; i++) {
    await makeGuess(request, cookie, gameId, 1, {
      cardWord: teamCards[i].word,
      role: "CODEBREAKER",
    });
  }

  await page.goto(`/game/${gameId}`);
  await dismissHandoff(page);
  await page.waitForTimeout(1500);

  await clickCard(page, teamCards[teamCards.length - 1].word);

  const body = await waitForGameOver(page);
  expect(body.toUpperCase()).toContain("MISSION COMPLETE");
  /** The winner is the first team. */
  expect(body.toUpperCase()).toContain(firstTeam.toUpperCase());
});

test("assassin guess → opposing team wins → game over", async ({ page, request }) => {
  const { gameId, cookie, gameState } = await setupGameViaApi(request);
  const token = cookie.replace("authToken=", "");
  await setAuthCookie(page.context(), token);

  const firstTeam = gameState.currentRound.turns[0].teamName;
  const otherTeam = gameState.teams.find((t: any) => t.name !== firstTeam).name;
  const assassin = gameState.currentRound.cards.find((c: any) => c.cardType === "ASSASSIN");

  await giveClue(request, cookie, gameId, 1, {
    word: "DOOM",
    targetCardCount: 1,
    role: "CODEMASTER",
  });

  await page.goto(`/game/${gameId}`);
  await dismissHandoff(page);
  await page.waitForTimeout(1500);

  await clickCard(page, assassin.word);

  const body = await waitForGameOver(page);
  expect(body.toUpperCase()).toContain("MISSION COMPLETE");
  /** Assassin gives the win to the OPPOSING team. */
  expect(body.toUpperCase()).toContain(otherTeam.toUpperCase());
});
