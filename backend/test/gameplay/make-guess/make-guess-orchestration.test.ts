/**
 * Tests for determineOutcomeStrategy — the pure post-guess strategy
 * derivation.
 *
 * Given a guess outcome and the post-guess state, determineOutcomeStrategy
 * returns a tagged union describing the cascade plan. These tests verify
 * the strategy for each outcome scenario.
 */
import { determineOutcomeStrategy } from "@backend/game/gameplay/turns/guess/outcome-strategy";
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

describe("determineOutcomeStrategy", () => {
  it("CORRECT_TEAM_CARD with guesses remaining: continues", () => {
    const gameState = buildGameWithBoard({ selectedRedCards: 6, guessesRemaining: 2 });
    const strategy = determineOutcomeStrategy({
      outcome: "CORRECT_TEAM_CARD",
      postGuessState: gameState,
    });
    expect(strategy).toEqual({ strategy: "continue" });
  });

  it("CORRECT_TEAM_CARD with 0 guesses remaining: ends turn", () => {
    const gameState = buildGameWithBoard({ selectedRedCards: 6, guessesRemaining: 0 });
    const strategy = determineOutcomeStrategy({
      outcome: "CORRECT_TEAM_CARD",
      postGuessState: gameState,
    });
    expect(strategy).toEqual({
      strategy: "end-turn",
      turnId: gameState.currentRound!.turns[0]._id,
    });
  });

  it("CORRECT_TEAM_CARD reveals last team card in BEST_OF_THREE: ends round only", () => {
    // All 9 Red cards selected post-guess → round won, BEST_OF_THREE so game continues
    const gameState = buildGameWithBoard({ selectedRedCards: 9, guessesRemaining: 2, format: "BEST_OF_THREE" });
    const strategy = determineOutcomeStrategy({
      outcome: "CORRECT_TEAM_CARD",
      postGuessState: gameState,
    });
    expect(strategy).toEqual({
      strategy: "end-round",
      turnId: gameState.currentRound!.turns[0]._id,
      roundId: gameState.currentRound!._id,
      roundWinningTeamId: 1,
    });
  });

  it("CORRECT_TEAM_CARD last card in QUICK format: ends game", () => {
    const gameState = buildGameWithBoard({ selectedRedCards: 9, guessesRemaining: 2, format: "QUICK" });
    const strategy = determineOutcomeStrategy({
      outcome: "CORRECT_TEAM_CARD",
      postGuessState: gameState,
    });
    expect(strategy).toEqual({
      strategy: "end-game",
      turnId: gameState.currentRound!.turns[0]._id,
      roundId: gameState.currentRound!._id,
      roundWinningTeamId: 1,
      gameWinningTeamId: 1,
    });
  });

  it("OTHER_TEAM_CARD with cards still remaining: ends turn", () => {
    const gameState = buildGameWithBoard({ selectedBlueCards: 4, guessesRemaining: 2 });
    const strategy = determineOutcomeStrategy({
      outcome: "OTHER_TEAM_CARD",
      postGuessState: gameState,
    });
    expect(strategy).toEqual({
      strategy: "end-turn",
      turnId: gameState.currentRound!.turns[0]._id,
    });
  });

  it("OTHER_TEAM_CARD reveals last opposing card in BEST_OF_THREE: ends round (other team wins)", () => {
    const gameState = buildGameWithBoard({ selectedBlueCards: 8, guessesRemaining: 2, format: "BEST_OF_THREE" });
    const strategy = determineOutcomeStrategy({
      outcome: "OTHER_TEAM_CARD",
      postGuessState: gameState,
    });
    expect(strategy).toEqual({
      strategy: "end-round",
      turnId: gameState.currentRound!.turns[0]._id,
      roundId: gameState.currentRound!._id,
      roundWinningTeamId: 2,
    });
  });

  it("BYSTANDER_CARD: ends turn only", () => {
    const gameState = buildGameWithBoard({ guessesRemaining: 2 });
    const strategy = determineOutcomeStrategy({
      outcome: "BYSTANDER_CARD",
      postGuessState: gameState,
    });
    expect(strategy).toEqual({
      strategy: "end-turn",
      turnId: gameState.currentRound!.turns[0]._id,
    });
  });

  it("ASSASSIN_CARD in QUICK format: ends game (other team wins)", () => {
    const gameState = buildGameWithBoard({ assassinSelected: true, guessesRemaining: 2, format: "QUICK" });
    const strategy = determineOutcomeStrategy({
      outcome: "ASSASSIN_CARD",
      postGuessState: gameState,
    });
    expect(strategy).toEqual({
      strategy: "end-game",
      turnId: gameState.currentRound!.turns[0]._id,
      roundId: gameState.currentRound!._id,
      roundWinningTeamId: 2,
      gameWinningTeamId: 2,
    });
  });

  it("ASSASSIN_CARD in BEST_OF_THREE: ends round (other team wins, game continues)", () => {
    const gameState = buildGameWithBoard({ assassinSelected: true, guessesRemaining: 2, format: "BEST_OF_THREE" });
    const strategy = determineOutcomeStrategy({
      outcome: "ASSASSIN_CARD",
      postGuessState: gameState,
    });
    expect(strategy).toEqual({
      strategy: "end-round",
      turnId: gameState.currentRound!.turns[0]._id,
      roundId: gameState.currentRound!._id,
      roundWinningTeamId: 2,
    });
  });
});
