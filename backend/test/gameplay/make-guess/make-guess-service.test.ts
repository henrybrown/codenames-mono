import { makeGuessService } from "@backend/game/gameplay/turns/guess/make-guess.service";
import { buildGameAggregate, buildTurn } from "../../__test-utils__/fixtures";
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

describe("makeGuessService", () => {
  const mockLogger = {
    for: () => ({ withMeta: () => ({ create: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }) }),
    error: vi.fn(),
  } as any;

  const mockTurnState = vi.fn<(...args: any[]) => any>();

  const createService = (opsMakeGuessResult?: any, handlerThrows: Error | null = null) => {
    const gameState = buildGameAggregate();
    const gameplayHandler = vi.fn<(...args: any[]) => any>().mockImplementation(
      async (_state: any, _player: any, fn: any) => {
        if (handlerThrows) throw handlerThrows;
        return fn({
          makeGuess: vi.fn<any>().mockResolvedValue(
            opsMakeGuessResult ?? {
              ok: true,
              guess: {
                card: { _id: 1, word: "APPLE" },
                guess: { _id: 1, createdAt: new Date() },
                turn: {
                  _id: 1,
                  _teamId: 1,
                  guessesRemaining: 2,
                  createdAt: new Date(),
                  completedAt: null,
                },
                outcome: "CORRECT_TEAM_CARD",
                createdAt: new Date(),
              },
              aftermath: { turnEnded: false, roundEnded: null, gameEnded: null },
              state: gameState,
            },
          ),
          endTurn: vi.fn<any>().mockResolvedValue(gameState),
          startTurn: vi.fn<any>().mockResolvedValue({ newTurn: { publicId: "new-turn-uuid" }, state: gameState }),
          endRound: vi.fn<any>().mockResolvedValue(gameState),
          endGame: vi.fn<any>().mockResolvedValue(gameState),
        });
      },
    );

    mockTurnState.mockResolvedValue({
      publicId: "turn-uuid",
      teamName: "Red",
      status: "ACTIVE",
      guessesRemaining: 2,
      createdAt: new Date(),
      completedAt: null,
      clue: { word: "FRUIT", number: 2, createdAt: new Date() },
      hasGuesses: true,
      lastGuess: { cardWord: "APPLE", playerName: "Bob", outcome: "CORRECT_TEAM_CARD", createdAt: new Date() },
      prevGuesses: [],
    });

    return makeGuessService(mockLogger)({
      gameplayHandler,
      loadTurn: mockTurnState,
    });
  };

  it("returns success with guess data on correct team card", async () => {
    const service = createService();
    const gameState = buildGameAggregate();

    const result = await service({ gameState, playerContext: playerCtx, cardWord: "APPLE" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.guess.outcome).toBe("CORRECT_TEAM_CARD");
      expect(result.data.guess.cardWord).toBe("APPLE");
      expect(result.data.turn).toBeDefined();
    }
  });

  it("returns failure with message when no current round", async () => {
    const service = createService();
    const gameState = buildGameAggregate({ currentRound: null });

    const result = await service({ gameState, playerContext: playerCtx, cardWord: "APPLE" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("No current round");
    }
  });

  it("propagates message from action when card is invalid", async () => {
    const service = createService({ ok: false, message: 'Card "APPLE" has already been selected' });

    const gameState = buildGameAggregate();
    const result = await service({ gameState, playerContext: playerCtx, cardWord: "APPLE" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe('Card "APPLE" has already been selected');
    }
  });

  it("propagates message from action when game state is invalid", async () => {
    const service = createService({ ok: false, message: "Game not in progress" });

    const gameState = buildGameAggregate();
    const result = await service({ gameState, playerContext: playerCtx, cardWord: "APPLE" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("Game not in progress");
    }
  });

  it("re-throws non-gameplay errors", async () => {
    const service = createService(undefined, new Error("Network error"));
    const gameState = buildGameAggregate();

    await expect(service({ gameState, cardWord: "APPLE" } as any)).rejects.toThrow("Network error");
  });
});
