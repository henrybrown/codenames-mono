/**
 * Tests for applyGuessOutcome — the post-guess orchestrator.
 *
 * Given a guess outcome and the resulting state, applyGuessOutcome decides
 * what cascades (turn-end / round-end / game-end) and calls the matching
 * ops. These tests verify which ops fire for each outcome scenario by
 * passing in narrow mock ops and inspecting call counts plus the returned
 * aftermath shape.
 */
import { applyGuessOutcome } from "@backend/game/gameplay/turns/guess/apply-guess-outcome";
import {
  buildGameAggregate,
  buildCard,
  buildTurn,
  buildRound,
  buildPlayer,
  resetIds,
} from "../../__test-utils__/fixtures";
import type { GameAggregate } from "@backend/game/state/types";

/**
 * Helper to build a game state with a specific board configuration.
 * 'selectedRedCards' of 9 total means all team cards are selected.
 */
const buildGameWithBoard = (opts: {
  selectedRedCards?: number;
  selectedBlueCards?: number;
  assassinSelected?: boolean;
  guessesRemaining?: number;
  format?: "QUICK" | "BEST_OF_THREE" | "ROUND_ROBIN";
  historicalRounds?: any[];
}): GameAggregate => {
  resetIds();
  const {
    selectedRedCards = 0,
    selectedBlueCards = 0,
    assassinSelected = false,
    guessesRemaining = 3,
    format = "QUICK",
    historicalRounds = [],
  } = opts;

  const redCards = Array.from({ length: 9 }, (_, i) =>
    buildCard({
      _teamId: 1,
      teamName: "Red",
      word: `RED${i}`,
      cardType: "TEAM",
      selected: i < selectedRedCards,
    }),
  );
  const blueCards = Array.from({ length: 8 }, (_, i) =>
    buildCard({
      _teamId: 2,
      teamName: "Blue",
      word: `BLUE${i}`,
      cardType: "TEAM",
      selected: i < selectedBlueCards,
    }),
  );
  const bystanders = Array.from({ length: 7 }, (_, i) =>
    buildCard({
      _teamId: null,
      teamName: null,
      word: `NEUTRAL${i}`,
      cardType: "BYSTANDER",
    }),
  );
  const assassin = buildCard({
    _teamId: null,
    teamName: null,
    word: "ASSASSIN",
    cardType: "ASSASSIN",
    selected: assassinSelected,
  });

  const cards = [...redCards, ...blueCards, ...bystanders, assassin];

  const turn = buildTurn({
    _teamId: 1,
    teamName: "Red",
    guessesRemaining,
    clue: { _id: 1, _turnId: 1, word: "FRUIT", number: 3, createdAt: new Date() },
  });

  const redCM = buildPlayer({ _teamId: 1, teamName: "Red", role: "CODEMASTER", publicName: "Alice" });
  const redCB = buildPlayer({ _teamId: 1, teamName: "Red", role: "CODEBREAKER", publicName: "Bob" });
  const blueCM = buildPlayer({ _teamId: 2, teamName: "Blue", role: "CODEMASTER", publicName: "Charlie" });
  const blueCB = buildPlayer({ _teamId: 2, teamName: "Blue", role: "CODEBREAKER", publicName: "Diana" });

  return buildGameAggregate({
    game_format: format,
    currentRound: buildRound({ cards, turns: [turn], players: [redCM, redCB, blueCM, blueCB] }),
    historicalRounds,
    teams: [
      { _id: 1, _gameId: 1, teamName: "Red", players: [redCM, redCB] },
      { _id: 2, _gameId: 1, teamName: "Blue", players: [blueCM, blueCB] },
    ],
  });
};

/**
 * Creates narrow mock ops whose endTurn/endRound/endGame each return the
 * given post-state (or a customised version). Tracks call counts.
 */
const createMockOps = (postState: GameAggregate, endRoundReturns?: GameAggregate) => {
  const endTurn = vi.fn<any>().mockResolvedValue(postState);
  const endRound = vi.fn<any>().mockResolvedValue(endRoundReturns ?? postState);
  const endGame = vi.fn<any>().mockResolvedValue(postState);
  return { endTurn, endRound, endGame };
};

const withHistoricalWinner = (
  state: GameAggregate,
  winningTeamId: number,
): GameAggregate => ({
  ...state,
  historicalRounds: [
    {
      _id: state.currentRound!._id,
      number: 1,
      status: "COMPLETED",
      _winningTeamId: winningTeamId,
      winningTeamName: winningTeamId === 1 ? "Red" : "Blue",
      createdAt: new Date(),
    },
  ],
});

describe("applyGuessOutcome", () => {
  it("CORRECT_TEAM_CARD with guesses remaining: no ops called, turn continues", async () => {
    const gameState = buildGameWithBoard({ selectedRedCards: 6, guessesRemaining: 2 });
    const ops = createMockOps(gameState);

    const aftermath = await applyGuessOutcome(ops, {
      outcome: "CORRECT_TEAM_CARD",
      turnId: gameState.currentRound!.turns[0]._id,
      guessingTeamId: 1,
      guessesRemaining: 2,
      postGuessState: gameState,
    });

    expect(ops.endTurn).not.toHaveBeenCalled();
    expect(ops.endRound).not.toHaveBeenCalled();
    expect(ops.endGame).not.toHaveBeenCalled();
    expect(aftermath).toEqual({
      turnEnded: false,
      roundEnded: null,
      gameEnded: null,
    });
  });

  it("CORRECT_TEAM_CARD with 0 guesses remaining: ends turn", async () => {
    const gameState = buildGameWithBoard({ selectedRedCards: 6, guessesRemaining: 0 });
    const ops = createMockOps(gameState);

    const aftermath = await applyGuessOutcome(ops, {
      outcome: "CORRECT_TEAM_CARD",
      turnId: gameState.currentRound!.turns[0]._id,
      guessingTeamId: 1,
      guessesRemaining: 0,
      postGuessState: gameState,
    });

    expect(ops.endTurn).toHaveBeenCalledTimes(1);
    expect(ops.endRound).not.toHaveBeenCalled();
    expect(ops.endGame).not.toHaveBeenCalled();
    expect(aftermath.turnEnded).toBe(true);
    expect(aftermath.roundEnded).toBeNull();
  });

  it("CORRECT_TEAM_CARD reveals last team card: ends turn and round", async () => {
    // All 9 Red cards selected post-guess → round won, but game format BEST_OF_THREE so no game end
    const gameState = buildGameWithBoard({ selectedRedCards: 9, guessesRemaining: 2, format: "BEST_OF_THREE" });
    const ops = createMockOps(gameState);

    const aftermath = await applyGuessOutcome(ops, {
      outcome: "CORRECT_TEAM_CARD",
      turnId: gameState.currentRound!.turns[0]._id,
      guessingTeamId: 1,
      guessesRemaining: 2,
      postGuessState: gameState,
    });

    expect(ops.endTurn).toHaveBeenCalledTimes(1);
    expect(ops.endRound).toHaveBeenCalledTimes(1);
    expect(ops.endGame).not.toHaveBeenCalled();
    expect(aftermath.turnEnded).toBe(true);
    expect(aftermath.roundEnded).toEqual({ winningTeamId: 1 });
    expect(aftermath.gameEnded).toBeNull();
  });

  it("CORRECT_TEAM_CARD last card in QUICK format: ends turn, round, and game", async () => {
    const gameState = buildGameWithBoard({ selectedRedCards: 9, guessesRemaining: 2, format: "QUICK" });
    const ops = createMockOps(gameState, withHistoricalWinner(gameState, 1));

    const aftermath = await applyGuessOutcome(ops, {
      outcome: "CORRECT_TEAM_CARD",
      turnId: gameState.currentRound!.turns[0]._id,
      guessingTeamId: 1,
      guessesRemaining: 2,
      postGuessState: gameState,
    });

    expect(ops.endTurn).toHaveBeenCalledTimes(1);
    expect(ops.endRound).toHaveBeenCalledTimes(1);
    expect(ops.endGame).toHaveBeenCalledTimes(1);
    expect(aftermath.gameEnded).toEqual({ winningTeamId: 1 });
  });

  it("OTHER_TEAM_CARD: ends turn (no round end if cards remain)", async () => {
    const gameState = buildGameWithBoard({ selectedBlueCards: 4, guessesRemaining: 2 });
    const ops = createMockOps(gameState);

    const aftermath = await applyGuessOutcome(ops, {
      outcome: "OTHER_TEAM_CARD",
      turnId: gameState.currentRound!.turns[0]._id,
      guessingTeamId: 1,
      guessesRemaining: 2,
      postGuessState: gameState,
    });

    expect(ops.endTurn).toHaveBeenCalledTimes(1);
    expect(ops.endRound).not.toHaveBeenCalled();
    expect(ops.endGame).not.toHaveBeenCalled();
    expect(aftermath.turnEnded).toBe(true);
  });

  it("OTHER_TEAM_CARD reveals last opposing card: ends turn and round (other team wins)", async () => {
    // All 8 Blue cards selected post-guess → Blue wins the round
    const gameState = buildGameWithBoard({ selectedBlueCards: 8, guessesRemaining: 2, format: "BEST_OF_THREE" });
    const ops = createMockOps(gameState);

    const aftermath = await applyGuessOutcome(ops, {
      outcome: "OTHER_TEAM_CARD",
      turnId: gameState.currentRound!.turns[0]._id,
      guessingTeamId: 1,
      guessesRemaining: 2,
      postGuessState: gameState,
    });

    expect(ops.endTurn).toHaveBeenCalledTimes(1);
    expect(ops.endRound).toHaveBeenCalledTimes(1);
    expect(aftermath.roundEnded).toEqual({ winningTeamId: 2 });
  });

  it("BYSTANDER_CARD: ends turn only", async () => {
    const gameState = buildGameWithBoard({ guessesRemaining: 2 });
    const ops = createMockOps(gameState);

    const aftermath = await applyGuessOutcome(ops, {
      outcome: "BYSTANDER_CARD",
      turnId: gameState.currentRound!.turns[0]._id,
      guessingTeamId: 1,
      guessesRemaining: 2,
      postGuessState: gameState,
    });

    expect(ops.endTurn).toHaveBeenCalledTimes(1);
    expect(ops.endRound).not.toHaveBeenCalled();
    expect(ops.endGame).not.toHaveBeenCalled();
    expect(aftermath.turnEnded).toBe(true);
  });

  it("ASSASSIN_CARD in QUICK format: ends turn, round (other team wins), and game", async () => {
    const gameState = buildGameWithBoard({ assassinSelected: true, guessesRemaining: 2, format: "QUICK" });
    const ops = createMockOps(gameState, withHistoricalWinner(gameState, 2));

    const aftermath = await applyGuessOutcome(ops, {
      outcome: "ASSASSIN_CARD",
      turnId: gameState.currentRound!.turns[0]._id,
      guessingTeamId: 1,
      guessesRemaining: 2,
      postGuessState: gameState,
    });

    expect(ops.endTurn).toHaveBeenCalledTimes(1);
    expect(ops.endRound).toHaveBeenCalledTimes(1);
    expect(ops.endGame).toHaveBeenCalledTimes(1);
    expect(aftermath.roundEnded).toEqual({ winningTeamId: 2 });
    expect(aftermath.gameEnded).toEqual({ winningTeamId: 2 });
  });
});
