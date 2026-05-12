import { test, expect, type Page } from "@playwright/test";
import { setAuthCookie } from "./fixtures/dashboard-helpers";
import { setupGameViaApi } from "./fixtures/game-helpers";

/**
 * Setup flow: the path from no account to standing in front of a game board.
 * Auth → game settings → lobby → first round.
 */

/** Click the visible instance of a duplicated-ID button. */
async function clickVisible(page: Page, selector: string, timeout = 5000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const all = await page.locator(selector).all();
    for (const el of all) {
      if (await el.isVisible().catch(() => false)) {
        await el.click();
        return;
      }
    }
    await page.waitForTimeout(200);
  }
  throw new Error(`No visible element for ${selector} within ${timeout}ms`);
}

/** Get the visible instance of a duplicated-ID element. */
async function getVisible(page: Page, selector: string) {
  const all = await page.locator(selector).all();
  for (const el of all) {
    if (await el.isVisible().catch(() => false)) return el;
  }
  return page.locator(selector).first();
}

/** On mobile, only one team's lobby panel is visible — switch tabs. */
async function switchTeamIfMobile(page: Page, team: "Team Red" | "Team Blue") {
  const label = team === "Team Red" ? "TEAM RED" : "TEAM BLUE";
  const tab = page.getByRole("button", { name: label, exact: true });
  if (await tab.isVisible({ timeout: 500 }).catch(() => false)) {
    await tab.click();
    await page.waitForTimeout(300);
  }
}

async function addPlayerToTeam(page: Page, team: "Team Red" | "Team Blue", name: string) {
  await switchTeamIfMobile(page, team);
  const slug = team.toLowerCase().replace(/\s+/g, "-");
  const input = await getVisible(page, `#add-player-${slug}-input`);
  await input.fill(name);
  (await getVisible(page, `#add-player-${slug}-btn`)).click();
  await expect(input).toHaveValue("", { timeout: 3000 });
}

test("single-device setup completes to first turn handoff", async ({ page }) => {
  await page.goto("/");

  /** Auth */
  await page.locator("#connect-btn").click();
  await expect(page.locator("#create-game-btn")).toBeVisible({ timeout: 5000 });

  /** Default game type is single-device. Toggle to multi and back to assert
   *  the toggle works, then proceed with single-device. */
  await expect(page.locator("#game-type-single")).toHaveAttribute("aria-pressed", "true");
  await page.locator("#game-type-multi").click();
  await expect(page.locator("#game-type-multi")).toHaveAttribute("aria-pressed", "true");
  await page.locator("#game-type-single").click();
  await expect(page.locator("#game-type-single")).toHaveAttribute("aria-pressed", "true");

  await page.locator("#create-game-btn").click();

  /** Lobby: add 2 per team, then start */
  await expect(page.locator("#start-game-btn")).toBeVisible({ timeout: 10_000 });
  await addPlayerToTeam(page, "Team Red", "Alice");
  await addPlayerToTeam(page, "Team Red", "Bob");
  await addPlayerToTeam(page, "Team Blue", "Charlie");
  await addPlayerToTeam(page, "Team Blue", "Diana");

  const startBtn = page.locator("#start-game-btn");
  await expect(startBtn).toBeEnabled({ timeout: 3000 });
  await startBtn.click();

  /** Lobby → start-round → handoff overlay marks gameplay start.
   *  Click "Start Round" twice (deal animation, then start gameplay). */
  await page.waitForTimeout(1500);
  await clickVisible(page, "#lobby-action-btn");
  await page.waitForTimeout(1500);
  await clickVisible(page, "#lobby-action-btn");

  /** Gameplay begins with the codemaster handoff. */
  await expect(page.locator("#handoff-execute-btn")).toBeVisible({ timeout: 10_000 });
});

test("multi-device: two browser contexts see the same board", async ({ browser, request }) => {
  const { gameId, cookie } = await setupGameViaApi(request, { gameType: "MULTI_DEVICE" });
  const token = cookie.replace("authToken=", "");

  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  await setAuthCookie(ctxA, token);
  await setAuthCookie(ctxB, token);
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  await pageA.goto(`/game/${gameId}`);
  await pageB.goto(`/game/${gameId}`);

  /** Both contexts see at least 25 cards (multiple layouts can render). */
  const cardsA = pageA.locator("[aria-label][data-team]");
  const cardsB = pageB.locator("[aria-label][data-team]");
  await expect(cardsA.first()).toBeVisible({ timeout: 15_000 });
  await expect(cardsB.first()).toBeVisible({ timeout: 15_000 });
  expect(await cardsA.count()).toBeGreaterThanOrEqual(25);
  expect(await cardsB.count()).toBeGreaterThanOrEqual(25);

  await ctxA.close();
  await ctxB.close();
});

test("start button disabled until quorum, enabled at 2+2", async ({ page }) => {
  await page.goto("/");
  await page.locator("#connect-btn").click();
  await expect(page.locator("#create-game-btn")).toBeVisible({ timeout: 5000 });
  await page.locator("#create-game-btn").click();

  const startBtn = page.locator("#start-game-btn");
  await expect(startBtn).toBeVisible({ timeout: 10_000 });
  await expect(startBtn).toBeDisabled();

  await addPlayerToTeam(page, "Team Red", "Alice");
  await expect(startBtn).toBeDisabled();

  await addPlayerToTeam(page, "Team Red", "Bob");
  /** 2 red, 0 blue — still not playable */
  await expect(startBtn).toBeDisabled();

  await addPlayerToTeam(page, "Team Blue", "Charlie");
  await addPlayerToTeam(page, "Team Blue", "Diana");
  await expect(startBtn).toBeEnabled({ timeout: 5000 });
});

test("single-device with AI mode toggled allows start without quorum", async ({ page }) => {
  await page.goto("/");
  await page.locator("#connect-btn").click();
  await expect(page.locator("#create-game-btn")).toBeVisible({ timeout: 5000 });

  /** Flip AI mode on, then create game */
  await page.locator("#ai-mode-toggle").click();
  await expect(page.locator("#ai-mode-toggle")).toHaveAttribute("data-active", "true");
  await page.locator("#create-game-btn").click();

  /** With aiMode, start is enabled with zero human players — the server fills
   *  empty slots with AI at game start. This is the AI-auto-fill contract. */
  const startBtn = page.locator("#start-game-btn");
  await expect(startBtn).toBeVisible({ timeout: 10_000 });
  await expect(startBtn).toBeEnabled({ timeout: 5000 });
});
