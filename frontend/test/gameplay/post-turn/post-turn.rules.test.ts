import { describe, it, expect } from "vitest";
import { isPostTurn } from "@frontend/game/gameplay/shared/post-turn.rules";
import { deriveHandoffView } from "@frontend/game/gameplay/single-device/handoff.rules";
import type { VisibilityContext } from "@frontend/game/gameplay/dashboard/config/context";
import type { ClaimedPhase } from "@frontend/game/gameplay/providers/active-game-session-provider";
import type { TurnData, TurnPhase } from "@frontend/shared/types";

/** Factories */

const baseCtx: VisibilityContext = {
  role: "NONE",
  teamName: undefined,
  playerName: undefined,
  activeTeamName: undefined,
  isActiveTeam: false,
  hasClue: false,
  guessesRemaining: 0,
  hasActiveTurn: false,
  activeTurn: null,
  lastCompletedTurn: null,
  roundStatus: null,
  hasCards: false,
  hasRound: false,
  isActionLoading: false,
  aiAvailable: false,
  aiThinking: false,
  active: null,
  isAiSession: false,
};

const ctx = (overrides: Partial<VisibilityContext>): VisibilityContext => ({
  ...baseCtx,
  ...overrides,
});

const humanActive = (role: TurnPhase["role"], teamName: string): TurnPhase => ({
  role,
  teamName,
  isAi: false,
  playerName: "Alice",
});

const aiActive = (role: TurnPhase["role"], teamName: string): TurnPhase => ({
  role,
  teamName,
  isAi: true,
  playerName: null,
});

const claimed = (role: ClaimedPhase["role"], teamName: string): ClaimedPhase => ({
  role,
  teamName,
});

const completedTurn = (id: string): TurnData => ({
  id,
  teamName: "Red",
  status: "COMPLETED",
  guessesRemaining: 0,
  createdAt: new Date(),
  completedAt: new Date(),
  clue: null,
  hasGuesses: false,
  lastGuess: null,
  prevGuesses: [],
  active: null,
});

/** Scenario: round not in progress */

describe("isPostTurn — not in progress", () => {
  it("false when round is null", () => {
    expect(isPostTurn(ctx({ roundStatus: null }))).toBe(false);
  });

  it("false during SETUP even with a completed turn in history", () => {
    expect(
      isPostTurn(
        ctx({
          roundStatus: "SETUP",
          lastCompletedTurn: completedTurn("t1"),
          hasRound: true,
        }),
      ),
    ).toBe(false);
  });

  it("false when round is COMPLETED (game-over owns that UI)", () => {
    expect(
      isPostTurn(
        ctx({
          roundStatus: "COMPLETED",
          lastCompletedTurn: completedTurn("t1"),
          hasRound: true,
        }),
      ),
    ).toBe(false);
  });
});

/** Scenario: between-turns (the shared window — same in both modes) */

describe("isPostTurn — between turns", () => {
  const betweenTurns = ctx({
    roundStatus: "IN_PROGRESS",
    hasRound: true,
    hasActiveTurn: false,
    lastCompletedTurn: completedTurn("t1"),
  });

  it("true regardless of role (single-device often has role NONE here)", () => {
    expect(isPostTurn(betweenTurns)).toBe(true);
    expect(isPostTurn({ ...betweenTurns, role: "NONE", teamName: undefined })).toBe(true);
  });

  it("true on the same data a multi-device viewer sees (universal)", () => {
    expect(isPostTurn({ ...betweenTurns, role: "CODEMASTER", teamName: "Red" })).toBe(true);
  });

  it("false on the first turn of the round (no completed turn yet)", () => {
    expect(
      isPostTurn(
        ctx({
          roundStatus: "IN_PROGRESS",
          hasRound: true,
          hasActiveTurn: false,
          lastCompletedTurn: null,
        }),
      ),
    ).toBe(false);
  });

  it("false the moment the next active turn arrives (window has closed)", () => {
    expect(isPostTurn({ ...betweenTurns, hasActiveTurn: true })).toBe(false);
  });
});

/** Scenario: deriveHandoffView (single-device only) */

describe("deriveHandoffView — no active turn", () => {
  it("'none' when active is null (this is the post-turn window — handoff stays out of it)", () => {
    expect(deriveHandoffView(null, null)).toBe("none");
    expect(deriveHandoffView(null, claimed("CODEMASTER", "Red"))).toBe("none");
  });
});

describe("deriveHandoffView — human turns", () => {
  it("'none' when role and team both match claimed", () => {
    expect(
      deriveHandoffView(humanActive("CODEMASTER", "Red"), claimed("CODEMASTER", "Red")),
    ).toBe("none");
    expect(
      deriveHandoffView(humanActive("CODEBREAKER", "Blue"), claimed("CODEBREAKER", "Blue")),
    ).toBe("none");
  });

  it("'handoff' when role changes, team same (codemaster → codebreaker, same team)", () => {
    expect(
      deriveHandoffView(humanActive("CODEBREAKER", "Red"), claimed("CODEMASTER", "Red")),
    ).toBe("handoff");
  });

  it("'handoff' when team changes, role same", () => {
    expect(
      deriveHandoffView(humanActive("CODEMASTER", "Blue"), claimed("CODEMASTER", "Red")),
    ).toBe("handoff");
  });

  it("'handoff' when both role and team change", () => {
    expect(
      deriveHandoffView(humanActive("CODEBREAKER", "Blue"), claimed("CODEMASTER", "Red")),
    ).toBe("handoff");
  });

  it("'handoff' when nothing claimed yet — initial device pickup", () => {
    expect(deriveHandoffView(humanActive("CODEMASTER", "Red"), null)).toBe("handoff");
  });
});

describe("deriveHandoffView — AI turns", () => {
  it("'none' when AI team matches claimed team (same team's AI plays — device already here)", () => {
    expect(
      deriveHandoffView(aiActive("CODEMASTER", "Red"), claimed("CODEMASTER", "Red")),
    ).toBe("none");
  });

  it("'ai-turn' when AI plays for a DIFFERENT team than the device is claimed to", () => {
    expect(
      deriveHandoffView(aiActive("CODEMASTER", "Blue"), claimed("CODEMASTER", "Red")),
    ).toBe("ai-turn");
  });

  it("'ai-turn' when nothing claimed yet and AI is up (fresh load / refresh mid-AI-turn)", () => {
    expect(deriveHandoffView(aiActive("CODEBREAKER", "Red"), null)).toBe("ai-turn");
  });
});

/** Scenario: transition sequence — the bug regression test */

describe("end-turn → countdown → next turn sequence", () => {
  // Simulates the full flow after Alice (Red codebreaker, single-device)
  // presses END TURN. Each step is independent.
  const alice = claimed("CODEBREAKER", "Red");

  it("step 1: Alice's turn active → not post-turn, no handoff", () => {
    const aliceActive = ctx({
      roundStatus: "IN_PROGRESS",
      hasRound: true,
      hasActiveTurn: true,
      active: humanActive("CODEBREAKER", "Red"),
    });
    expect(isPostTurn(aliceActive)).toBe(false);
    expect(deriveHandoffView(aliceActive.active, alice)).toBe("none");
  });

  it("step 2: end-turn resolved, no active turn yet → POST-TURN, NOT handoff", () => {
    // The structural guarantee: in the post-turn window, active is null,
    // so deriveHandoffView is always 'none'. They cannot collide.
    const postTurn = ctx({
      roundStatus: "IN_PROGRESS",
      hasRound: true,
      hasActiveTurn: false,
      lastCompletedTurn: completedTurn("t1"),
    });
    expect(isPostTurn(postTurn)).toBe(true);
    expect(deriveHandoffView(postTurn.active, alice)).toBe("none");
  });

  it("step 3: NextTurnTrigger fires → Blue codemaster active → handoff, NOT post-turn", () => {
    const blueActive = ctx({
      roundStatus: "IN_PROGRESS",
      hasRound: true,
      hasActiveTurn: true,
      lastCompletedTurn: completedTurn("t1"),
      active: humanActive("CODEMASTER", "Blue"),
    });
    expect(isPostTurn(blueActive)).toBe(false);
    expect(deriveHandoffView(blueActive.active, alice)).toBe("handoff");
  });
});
