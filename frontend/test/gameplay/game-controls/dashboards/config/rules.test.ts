import { describe, it, expect } from "vitest";
import {
  isCodemaster,
  isCodebreaker,
  isSpectator,
  hasRole,
  isCodemasterGivingClue,
  isCodemasterObserving,
  isCodebreakerGuessing,
  isCodebreakerObserving,
  isInLobby,
  isRoundComplete,
  canDealCards,
  canStartRound,
  isAiActive,
  canUseArToggle,
} from "@frontend/game/gameplay/dashboard/config/rules";
import { isPostTurn } from "@frontend/game/gameplay/shared/post-turn.rules";
import type { TurnData } from "@frontend/shared/types";
import type { VisibilityContext } from "@frontend/game/gameplay/dashboard/config/context";

/** Factory */

const base: VisibilityContext = {
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
  ...base,
  ...overrides,
});

/** Role identity */

describe("isCodemaster / isCodebreaker / isSpectator", () => {
  it("isCodemaster: true only for CODEMASTER role", () => {
    expect(isCodemaster(ctx({ role: "CODEMASTER" }))).toBe(true);
    expect(isCodemaster(ctx({ role: "CODEBREAKER" }))).toBe(false);
    expect(isCodemaster(ctx({ role: "NONE" }))).toBe(false);
  });

  it("isCodebreaker: true only for CODEBREAKER role", () => {
    expect(isCodebreaker(ctx({ role: "CODEBREAKER" }))).toBe(true);
    expect(isCodebreaker(ctx({ role: "CODEMASTER" }))).toBe(false);
  });

  it("isSpectator: true for SPECTATOR or NONE", () => {
    expect(isSpectator(ctx({ role: "SPECTATOR" }))).toBe(true);
    expect(isSpectator(ctx({ role: "NONE" }))).toBe(true);
    expect(isSpectator(ctx({ role: "CODEMASTER" }))).toBe(false);
  });

  it("hasRole: true when role is not NONE and teamName is set", () => {
    expect(hasRole(ctx({ role: "CODEMASTER", teamName: "Red" }))).toBe(true);
    expect(hasRole(ctx({ role: "CODEMASTER" }))).toBe(false); // no teamName
    expect(hasRole(ctx({ role: "NONE", teamName: "Red" }))).toBe(false); // NONE role
  });
});

/** Codemaster giving clue */

describe("isCodemasterGivingClue", () => {
  const givingClueCtx = ctx({
    role: "CODEMASTER",
    teamName: "Red",
    activeTeamName: "Red",
    isActiveTeam: true,
    hasActiveTurn: true,
    hasClue: false,
  });

  it("true when all conditions met", () => {
    expect(isCodemasterGivingClue(givingClueCtx)).toBe(true);
  });

  it("false when not active turn", () => {
    expect(isCodemasterGivingClue({ ...givingClueCtx, hasActiveTurn: false })).toBe(false);
  });

  it("false when clue already given", () => {
    expect(isCodemasterGivingClue({ ...givingClueCtx, hasClue: true })).toBe(false);
  });

  it("false when not active team", () => {
    expect(isCodemasterGivingClue({ ...givingClueCtx, isActiveTeam: false })).toBe(false);
  });

  it("false for CODEBREAKER role", () => {
    expect(isCodemasterGivingClue({ ...givingClueCtx, role: "CODEBREAKER" })).toBe(false);
  });

  it("false during AI session (even if role/team/turn all match)", () => {
    expect(isCodemasterGivingClue({ ...givingClueCtx, isAiSession: true })).toBe(false);
  });
});

describe("isCodemasterObserving", () => {
  it("true when CODEMASTER but not active team", () => {
    expect(isCodemasterObserving(ctx({ role: "CODEMASTER", isActiveTeam: false, hasActiveTurn: true }))).toBe(true);
  });

  it("true when CODEMASTER and no active turn", () => {
    expect(isCodemasterObserving(ctx({ role: "CODEMASTER", hasActiveTurn: false }))).toBe(true);
  });

  it("true when CODEMASTER and clue already given", () => {
    expect(isCodemasterObserving(ctx({ role: "CODEMASTER", isActiveTeam: true, hasActiveTurn: true, hasClue: true }))).toBe(true);
  });

  it("false when CODEMASTER is actively giving a clue", () => {
    expect(isCodemasterObserving(ctx({ role: "CODEMASTER", isActiveTeam: true, hasActiveTurn: true, hasClue: false }))).toBe(false);
  });
});

/** Codebreaker guessing */

describe("isCodebreakerGuessing", () => {
  const guessingCtx = ctx({
    role: "CODEBREAKER",
    teamName: "Red",
    activeTeamName: "Red",
    isActiveTeam: true,
    hasActiveTurn: true,
    hasClue: true,
    guessesRemaining: 3,
  });

  it("true when all conditions met", () => {
    expect(isCodebreakerGuessing(guessingCtx)).toBe(true);
  });

  it("false when no guesses remaining", () => {
    expect(isCodebreakerGuessing({ ...guessingCtx, guessesRemaining: 0 })).toBe(false);
  });

  it("false when no clue yet", () => {
    expect(isCodebreakerGuessing({ ...guessingCtx, hasClue: false })).toBe(false);
  });

  it("false when not active team", () => {
    expect(isCodebreakerGuessing({ ...guessingCtx, isActiveTeam: false })).toBe(false);
  });

  it("false for CODEMASTER role", () => {
    expect(isCodebreakerGuessing({ ...guessingCtx, role: "CODEMASTER" })).toBe(false);
  });

  it("false during AI session (even if role/team/clue/guesses all match)", () => {
    expect(isCodebreakerGuessing({ ...guessingCtx, isAiSession: true })).toBe(false);
  });
});

describe("isCodebreakerObserving", () => {
  it("true when CODEBREAKER but no clue yet", () => {
    expect(isCodebreakerObserving(ctx({ role: "CODEBREAKER", isActiveTeam: true, hasActiveTurn: true, hasClue: false }))).toBe(true);
  });

  it("true when CODEBREAKER but no guesses remaining", () => {
    expect(isCodebreakerObserving(ctx({ role: "CODEBREAKER", isActiveTeam: true, hasActiveTurn: true, hasClue: true, guessesRemaining: 0 }))).toBe(true);
  });

  it("false when actively guessing", () => {
    expect(isCodebreakerObserving(ctx({ role: "CODEBREAKER", isActiveTeam: true, hasActiveTurn: true, hasClue: true, guessesRemaining: 2 }))).toBe(false);
  });
});

/** Lobby / round state */

describe("isInLobby", () => {
  it("true when there is no round", () => {
    expect(isInLobby(ctx({ hasRound: false }))).toBe(true);
  });

  it("true when round status is SETUP", () => {
    expect(isInLobby(ctx({ hasRound: true, roundStatus: "SETUP" }))).toBe(true);
  });

  it("false when round is IN_PROGRESS", () => {
    expect(isInLobby(ctx({ hasRound: true, roundStatus: "IN_PROGRESS" }))).toBe(false);
  });

  it("false when round is COMPLETED", () => {
    expect(isInLobby(ctx({ hasRound: true, roundStatus: "COMPLETED" }))).toBe(false);
  });
});

describe("isRoundComplete", () => {
  it("true only when roundStatus is COMPLETED", () => {
    expect(isRoundComplete(ctx({ roundStatus: "COMPLETED" }))).toBe(true);
    expect(isRoundComplete(ctx({ roundStatus: "IN_PROGRESS" }))).toBe(false);
    expect(isRoundComplete(ctx({ roundStatus: null }))).toBe(false);
  });
});

describe("canDealCards / canStartRound", () => {
  it("canDealCards: true in lobby with no cards", () => {
    expect(canDealCards(ctx({ hasRound: true, roundStatus: "SETUP", hasCards: false }))).toBe(true);
  });

  it("canDealCards: false when cards already dealt", () => {
    expect(canDealCards(ctx({ hasRound: true, roundStatus: "SETUP", hasCards: true }))).toBe(false);
  });

  it("canStartRound: true in lobby when cards exist", () => {
    expect(canStartRound(ctx({ hasRound: true, roundStatus: "SETUP", hasCards: true }))).toBe(true);
  });

  it("canStartRound: false with no cards", () => {
    expect(canStartRound(ctx({ hasRound: true, roundStatus: "SETUP", hasCards: false }))).toBe(false);
  });
});

/** AI active */

describe("isAiActive", () => {
  const inProgressCtx = ctx({ hasRound: true, roundStatus: "IN_PROGRESS", hasActiveTurn: true });

  it("true when AI is available and round is in progress with active turn", () => {
    expect(isAiActive({ ...inProgressCtx, aiAvailable: true })).toBe(true);
  });

  it("true when AI is thinking", () => {
    expect(isAiActive({ ...inProgressCtx, aiThinking: true })).toBe(true);
  });

  it("false when no active turn", () => {
    expect(isAiActive({ ...inProgressCtx, hasActiveTurn: false, aiAvailable: true })).toBe(false);
  });

  it("false when round is not in progress", () => {
    expect(isAiActive({ ...ctx({ roundStatus: "SETUP", hasActiveTurn: true }), aiAvailable: true })).toBe(false);
  });

  it("false when AI is neither available nor thinking", () => {
    expect(isAiActive(inProgressCtx)).toBe(false);
  });
});

/** canUseArToggle */

describe("canUseArToggle", () => {
  const humanCodemasterInProgress = ctx({
    role: "CODEMASTER",
    teamName: "Red",
    roundStatus: "IN_PROGRESS",
    hasRound: true,
    isAiSession: false,
  });

  it("true for human codemaster during an active round", () => {
    expect(canUseArToggle(humanCodemasterInProgress)).toBe(true);
  });

  it("false during an AI session (AI codemaster turn)", () => {
    expect(canUseArToggle({ ...humanCodemasterInProgress, isAiSession: true })).toBe(false);
  });

  it("false for codebreaker role", () => {
    expect(canUseArToggle({ ...humanCodemasterInProgress, role: "CODEBREAKER" })).toBe(false);
  });

  it("false when round is not in progress (lobby)", () => {
    expect(canUseArToggle({ ...humanCodemasterInProgress, roundStatus: "SETUP" })).toBe(false);
  });

  it("false when round is completed (game over)", () => {
    expect(canUseArToggle({ ...humanCodemasterInProgress, roundStatus: "COMPLETED" })).toBe(false);
  });

  it("false when role is NONE (spectator)", () => {
    expect(canUseArToggle({ ...humanCodemasterInProgress, role: "NONE" })).toBe(false);
  });
});

/** isPostTurn — universal post-turn window detector */

describe("isPostTurn", () => {
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

  const betweenTurnsCtx = ctx({
    roundStatus: "IN_PROGRESS",
    hasRound: true,
    hasActiveTurn: false,
    lastCompletedTurn: completedTurn("t1"),
  });

  it("true between turns regardless of role (single-device often has role NONE here)", () => {
    expect(isPostTurn(betweenTurnsCtx)).toBe(true);
    expect(
      isPostTurn({ ...betweenTurnsCtx, role: "NONE", teamName: undefined }),
    ).toBe(true);
  });

  it("false when there is an active turn", () => {
    expect(isPostTurn({ ...betweenTurnsCtx, hasActiveTurn: true })).toBe(false);
  });

  it("false on the very first turn of a round (no completed turn yet)", () => {
    expect(isPostTurn({ ...betweenTurnsCtx, lastCompletedTurn: null })).toBe(false);
  });

  it("false when round is SETUP (lobby)", () => {
    expect(isPostTurn({ ...betweenTurnsCtx, roundStatus: "SETUP" })).toBe(false);
  });

  it("false when round is COMPLETED (game over owns that UI)", () => {
    expect(isPostTurn({ ...betweenTurnsCtx, roundStatus: "COMPLETED" })).toBe(false);
  });

  it("false when there is no round", () => {
    expect(isPostTurn({ ...betweenTurnsCtx, hasRound: false })).toBe(false);
  });
});
