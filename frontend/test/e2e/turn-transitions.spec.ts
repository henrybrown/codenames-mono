import { test, expect } from "@playwright/test";
import {
  setupGameViaApi,
  setupMultiDeviceGame,
  giveClue,
  makeGuess,
  getGameState,
} from "./fixtures/game-helpers";
import { setAuthCookie } from "./fixtures/dashboard-helpers";
import {
  dismissHandoff,
  clickCard,
  giveClueViaUI,
} from "./fixtures/flow-helpers";

/**
 * Turn transitions: what users see when one turn ends and the next begins.
 *
 * Single-device: a handoff overlay appears for the next role/team after the
 * 8s NextTurnTrigger countdown. Multi-device: no overlay; views update live
 * via websocket.
 */

test("single-device — handoff to next team's codemaster after countdown", async ({ page, request }) => {
  const { gameId, cookie, gameState } = await setupGameViaApi(request);
  const token = cookie.replace("authToken=", "");
  await setAuthCookie(page.context(), token);

  const firstTeam = gameState.currentRound.turns[0].teamName;
  const otherTeam = gameState.teams.find((t: any) => t.name !== firstTeam).name;
  const bystander = gameState.currentRound.cards.find((c: any) => c.cardType === "BYSTANDER");

  await page.goto(`/game/${gameId}`);
  await dismissHandoff(page);
  await giveClueViaUI(page, "TICK", 1);
  await dismissHandoff(page);
  await clickCard(page, bystander.word);

  /** Turn ends → outcome panel → 8s countdown → NextTurnTrigger creates next
   *  turn → handoff overlay appears for the other team's codemaster. */
  const nextHandoff = page.locator("#handoff-execute-btn");
  await nextHandoff.waitFor({ state: "visible", timeout: 15_000 });

  /** The next handoff shows the other team + "Spymaster" role. */
  await expect(page.locator("body")).toContainText(otherTeam, { ignoreCase: true });
  await expect(page.locator("body")).toContainText("Spymaster");
});

test("single-device on mobile — next-turn handoff still appears via drawer layout", async ({ page, request }) => {
  /** Force mobile viewport for this one test. */
  await page.setViewportSize({ width: 390, height: 844 });

  const { gameId, cookie, gameState } = await setupGameViaApi(request);
  const token = cookie.replace("authToken=", "");
  await setAuthCookie(page.context(), token);

  const firstTeam = gameState.currentRound.turns[0].teamName;
  const otherTeam = gameState.teams.find((t: any) => t.name !== firstTeam).name;
  const bystander = gameState.currentRound.cards.find((c: any) => c.cardType === "BYSTANDER");

  await page.goto(`/game/${gameId}`);
  await dismissHandoff(page);
  await giveClueViaUI(page, "TOCK", 1);
  await dismissHandoff(page);
  await clickCard(page, bystander.word);

  /** Handoff is a full-screen overlay — drawer layout doesn't hide it. */
  const nextHandoff = page.locator("#handoff-execute-btn");
  await nextHandoff.waitFor({ state: "visible", timeout: 15_000 });
  await expect(page.locator("body")).toContainText(otherTeam, { ignoreCase: true });
});

test("multi-device — no handoff overlay, live update on turn switch", async ({ page, request }) => {
  const { gameId, gameState, players } = await setupMultiDeviceGame(request);

  const firstTeam = gameState.currentRound.turns[0].teamName;
  const firstTeamCM = players.find((p) => p.teamName === firstTeam && p.role === "CODEMASTER")!;
  const firstTeamCB = players.find((p) => p.teamName === firstTeam && p.role === "CODEBREAKER")!;
  const otherTeam = gameState.teams.find((t: any) => t.name !== firstTeam).name;
  const otherTeamCard = gameState.currentRound.cards.find(
    (c: any) => c.cardType === "TEAM" && c.teamName !== firstTeam,
  );

  /** Use the codebreaker's cookie for the browser. The NextTurnTrigger
   *  side-effect runs from this browser; multi-device gameRole middleware
   *  gates start-turn on CODEBREAKER, so the browser identity matters. */
  await setAuthCookie(page.context(), firstTeamCB.cookie.replace("authToken=", ""));

  await page.goto(`/game/${gameId}`);
  await page.waitForTimeout(2000); // settle

  /** Multi-device must never show the handoff overlay. */
  await expect(page.locator("#handoff-execute-btn")).not.toBeVisible();

  /** Drive the turn via API using each role's own cookie. */
  await giveClue(request, firstTeamCM.cookie, gameId, 1, {
    word: "BRIDGE",
    targetCardCount: 1,
    playerId: firstTeamCM.publicId,
  });

  await makeGuess(request, firstTeamCB.cookie, gameId, 1, {
    cardWord: otherTeamCard.word,
    playerId: firstTeamCB.publicId,
  });

  /** Browser sees outcome panel from websocket push. */
  await expect(page.locator("body")).toContainText("TURN COMPLETE", { timeout: 10_000 });

  /** Wait for the 8s countdown + next-turn creation. */
  await page.waitForTimeout(10_000);

  const updated = await getGameState(request, firstTeamCB.cookie, gameId);
  const activeTurn = updated.currentRound.turns.find((t: any) => t.status === "ACTIVE");
  expect(activeTurn).toBeDefined();
  expect(activeTurn.teamName).toBe(otherTeam);

  /** Critical multi-device assertion: at no point did a handoff overlay show. */
  await expect(page.locator("#handoff-execute-btn")).not.toBeVisible();
});
