/**
 * Tests for the guess orchestration logic in make-guess.service.ts
 *
 * The service's switch statement (lines 191-251) decides what happens after each
 * guess outcome. These tests verify which ops get called for each scenario.
 * The ops interface is the natural mock boundary — they handle DB transactions
 * while the orchestration logic lives in the service.
 */
import { makeGuessService } from "@backend/game/gameplay/turns/guess/make-guess.service";
import {
  buildGameAggregate,
  buildCard,
  buildTurn,
  buildRound,
  buildPlayer,
  resetIds,
} from "../../__test-utils__/fixtures";
import type { GameAggregate } from "@backend/game/state/gameplay-state.types";
import type { GamePlayer } from "@backend/game/access";

const playerCtx: GamePlayer = {
  _id: 1,
  publicId: "player-1",
  _userId: 101,
  _teamId: 1,
  teamName: "Red",
  publicName: "Bob",
  role: "CODEBREAKER",
};

vi.mock("@backend/shared/websocket", () => ({
  GameEventsEmitter: {
    guessMade: vi.fn(),
    turnEnded: vi.fn(),
    turnStarted: vi.fn(),
  },
}));

describe("make-guess orchestration", () => {
  const mockLogger = {
    for: () => ({
      withMeta: () => ({
        create: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
      }),
    }),
  } as any;

  const mockTurnState = vi.fn<(...args: any[]) => any>();

  beforeEach(() => {
    resetIds();
    mockTurnState.mockResolvedValue({
      publicId: "turn-uuid",
      teamName: "Red",
      status: "ACTIVE",
      guessesRemaining: 2,
      createdAt: new Date(),
      completedAt: null,
      clue: { word: "FRUIT", number: 2, createdAt: new Date() },
      hasGuesses: true,
      lastGuess: {
        cardWord: "APPLE",
        playerName: "Bob",
        outcome: "CORRECT_TEAM_CARD",
        createdAt: new Date(),
      },
      prevGuesses: [],
    });
  });

  /**
   * Helper to build a game state with a specific board configuration.
   * 'selectedRedCards' of 9 total means the next correct guess wins the round.
   */
  const buildGameWithBoard = (opts: {
    selectedRedCards?: number;
    selectedBlueCards?: number;
    assassinSelected?: boolean;
    guessesRemaining?: number;
    format?: "QUICK" | "BEST_OF_THREE" | "ROUND_ROBIN";
    historicalRounds?: any[];
  }) => {
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
   * Creates a service with mock ops that track which methods are called.
   * The mock ops.makeGuess returns a state reflecting the given outcome.
   */
  const createServiceWithTracking = (
    gameState: GameAggregate,
    outcome: string,
    postGuessState?: Partial<GameAggregate>,
  ) => {
    const ops = {
      makeGuess: vi.fn<any>(),
      endTurn: vi.fn<any>(),
      startTurn: vi.fn<any>(),
      endRound: vi.fn<any>(),
      endGame: vi.fn<any>(),
    };

    const stateAfterGuess = { ...gameState, ...postGuessState } as GameAggregate;

    ops.makeGuess.mockResolvedValue({
      outcome,
      card: { _id: 1, word: "TARGET" },
      guess: { _id: 1, createdAt: new Date() },
      turn: {
        _id: gameState.currentRound!.turns[0]._id,
        _teamId: 1,
        guessesRemaining: stateAfterGuess.currentRound!.turns[0].guessesRemaining,
      },
      state: stateAfterGuess,
      createdAt: new Date(),
    });

    ops.endTurn.mockResolvedValue(stateAfterGuess);
    ops.startTurn.mockResolvedValue({
      newTurn: { publicId: "new-turn-uuid" },
      state: stateAfterGuess,
    });
    ops.endRound.mockResolvedValue({
      ...stateAfterGuess,
      historicalRounds: [
        ...(stateAfterGuess.historicalRounds || []),
        {
          _id: stateAfterGuess.currentRound!._id,
          number: 1,
          status: "COMPLETED",
          _winningTeamId: 2,
          winningTeamName: "Blue",
          createdAt: new Date(),
        },
      ],
    });
    ops.endGame.mockResolvedValue(stateAfterGuess);

    const gameplayHandler = vi.fn<any>().mockImplementation(
      async (_state: any, fn: any) => fn(ops),
    );

    const service = makeGuessService(mockLogger)({
      gameplayHandler,
      getTurnState: mockTurnState,
    });

    return { service, ops };
  };

  it("CORRECT_TEAM_CARD with guesses remaining: only makeGuess called, turn continues", async () => {
    const gameState = buildGameWithBoard({ selectedRedCards: 5, guessesRemaining: 3 });
    // After guess: 8 of 9 selected (not all), guessesRemaining decremented to 2
    const postState = {
      currentRound: {
        ...gameState.currentRound!,
        cards: gameState.currentRound!.cards.map((c) =>
          c.word === "RED5" ? { ...c, selected: true } : c,
        ),
        turns: [{ ...gameState.currentRound!.turns[0], guessesRemaining: 2 }],
      },
    };

    const { service, ops } = createServiceWithTracking(gameState, "CORRECT_TEAM_CARD", postState);
    await service({ gameState, playerContext: playerCtx, cardWord: "RED5" });

    expect(ops.makeGuess).toHaveBeenCalledTimes(1);
    expect(ops.endTurn).not.toHaveBeenCalled();
    expect(ops.endRound).not.toHaveBeenCalled();
    expect(ops.endGame).not.toHaveBeenCalled();
    expect(ops.startTurn).not.toHaveBeenCalled();
  });

  it("CORRECT_TEAM_CARD with 0 guesses remaining: ends turn (next turn started by frontend)", async () => {
    const gameState = buildGameWithBoard({ selectedRedCards: 5, guessesRemaining: 1 });
    const postState = {
      currentRound: {
        ...gameState.currentRound!,
        cards: gameState.currentRound!.cards.map((c) =>
          c.word === "RED5" ? { ...c, selected: true } : c,
        ),
        turns: [{ ...gameState.currentRound!.turns[0], guessesRemaining: 0 }],
      },
    };

    const { service, ops } = createServiceWithTracking(gameState, "CORRECT_TEAM_CARD", postState);
    await service({ gameState, playerContext: playerCtx, cardWord: "RED5" });

    expect(ops.endTurn).toHaveBeenCalledTimes(1);
    expect(ops.startTurn).not.toHaveBeenCalled();
    expect(ops.endRound).not.toHaveBeenCalled();
    expect(ops.endGame).not.toHaveBeenCalled();
  });

  it("CORRECT_TEAM_CARD reveals last team card: ends turn and round", async () => {
    // 8 already selected, this is the 9th → round won
    const gameState = buildGameWithBoard({ selectedRedCards: 8, guessesRemaining: 2 });
    const postState = {
      currentRound: {
        ...gameState.currentRound!,
        cards: gameState.currentRound!.cards.map((c) =>
          c.word === "RED8" ? { ...c, selected: true } : c,
        ),
      },
    };

    const { service, ops } = createServiceWithTracking(gameState, "CORRECT_TEAM_CARD", postState);
    await service({ gameState, playerContext: playerCtx, cardWord: "RED8" });

    expect(ops.endTurn).toHaveBeenCalledTimes(1);
    expect(ops.endRound).toHaveBeenCalledTimes(1);
    expect(ops.startTurn).not.toHaveBeenCalled();
  });

  it("CORRECT_TEAM_CARD last card in QUICK format: ends turn, round, and game", async () => {
    const gameState = buildGameWithBoard({
      selectedRedCards: 8,
      guessesRemaining: 2,
      format: "QUICK",
    });
    const postState = {
      currentRound: {
        ...gameState.currentRound!,
        cards: gameState.currentRound!.cards.map((c) =>
          c.word === "RED8" ? { ...c, selected: true } : c,
        ),
      },
    };

    // Mock endRound to return a historical round so checkGameWinner sees it
    const { service, ops } = createServiceWithTracking(gameState, "CORRECT_TEAM_CARD", postState);
    ops.endRound.mockResolvedValue({
      ...gameState,
      ...postState,
      historicalRounds: [
        {
          _id: 1,
          number: 1,
          status: "COMPLETED",
          _winningTeamId: 1,
          winningTeamName: "Red",
          createdAt: new Date(),
        },
      ],
    });

    await service({ gameState, playerContext: playerCtx, cardWord: "RED8" });

    expect(ops.endTurn).toHaveBeenCalledTimes(1);
    expect(ops.endRound).toHaveBeenCalledTimes(1);
    expect(ops.endGame).toHaveBeenCalledTimes(1);
  });

  it("OTHER_TEAM_CARD: ends turn (next turn started by frontend)", async () => {
    const gameState = buildGameWithBoard({ selectedBlueCards: 3, guessesRemaining: 2 });
    const postState = {
      currentRound: {
        ...gameState.currentRound!,
        cards: gameState.currentRound!.cards.map((c) =>
          c.word === "BLUE3" ? { ...c, selected: true } : c,
        ),
      },
    };

    const { service, ops } = createServiceWithTracking(gameState, "OTHER_TEAM_CARD", postState);
    await service({ gameState, playerContext: playerCtx, cardWord: "BLUE3" });

    expect(ops.endTurn).toHaveBeenCalledTimes(1);
    expect(ops.startTurn).not.toHaveBeenCalled();
    expect(ops.endRound).not.toHaveBeenCalled();
  });

  it("OTHER_TEAM_CARD reveals last opposing card: ends turn and round (other team wins)", async () => {
    // Blue has 7 of 8 selected. Guessing the 8th completes their set → Blue wins
    const gameState = buildGameWithBoard({ selectedBlueCards: 7, guessesRemaining: 2 });
    const postState = {
      currentRound: {
        ...gameState.currentRound!,
        cards: gameState.currentRound!.cards.map((c) =>
          c.word === "BLUE7" ? { ...c, selected: true } : c,
        ),
      },
    };

    const { service, ops } = createServiceWithTracking(gameState, "OTHER_TEAM_CARD", postState);
    await service({ gameState, playerContext: playerCtx, cardWord: "BLUE7" });

    expect(ops.endTurn).toHaveBeenCalledTimes(1);
    expect(ops.endRound).toHaveBeenCalledTimes(1);
    expect(ops.startTurn).not.toHaveBeenCalled();
  });

  it("BYSTANDER_CARD: ends turn (next turn started by frontend)", async () => {
    const gameState = buildGameWithBoard({ guessesRemaining: 2 });

    const { service, ops } = createServiceWithTracking(gameState, "BYSTANDER_CARD");
    await service({ gameState, playerContext: playerCtx, cardWord: "NEUTRAL0" });

    expect(ops.endTurn).toHaveBeenCalledTimes(1);
    expect(ops.startTurn).not.toHaveBeenCalled();
    expect(ops.endRound).not.toHaveBeenCalled();
    expect(ops.endGame).not.toHaveBeenCalled();
  });

  it("ASSASSIN_CARD: ends turn, ends round (other team wins), ends game", async () => {
    const gameState = buildGameWithBoard({ guessesRemaining: 2 });
    const postState = {
      currentRound: {
        ...gameState.currentRound!,
        cards: gameState.currentRound!.cards.map((c) =>
          c.word === "ASSASSIN" ? { ...c, selected: true } : c,
        ),
      },
    };

    const { service, ops } = createServiceWithTracking(gameState, "ASSASSIN_CARD", postState);
    // endRound returns state with historical round showing other team won
    ops.endRound.mockResolvedValue({
      ...gameState,
      ...postState,
      historicalRounds: [
        {
          _id: 1,
          number: 1,
          status: "COMPLETED",
          _winningTeamId: 2,
          winningTeamName: "Blue",
          createdAt: new Date(),
        },
      ],
    });

    await service({ gameState, playerContext: playerCtx, cardWord: "ASSASSIN" });

    expect(ops.endTurn).toHaveBeenCalledTimes(1);
    expect(ops.endRound).toHaveBeenCalledTimes(1);
    expect(ops.endGame).toHaveBeenCalledTimes(1);
    expect(ops.startTurn).not.toHaveBeenCalled();
  });
});
