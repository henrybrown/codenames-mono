import { makeGuessService } from "@backend/game/gameplay/turns/guess/make-guess.service";
import { buildGameAggregate, buildTurn } from "../../__test-utils__/fixtures";
import type { GameAggregate } from "@backend/game/state/types";

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

  const createService = (
    gameState: GameAggregate | null,
    opsMakeGuessResult?: any,
    handlerThrows: Error | null = null,
  ) => {
    const opsState = buildGameAggregate();
    const gameplayHandler = vi.fn<(...args: any[]) => any>().mockImplementation(
      async (_state: any, _player: any, fn: any) => {
        if (handlerThrows) throw handlerThrows;
        return fn({
          state: vi.fn<any>().mockResolvedValue(opsState),
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
            },
          ),
          endTurn: vi.fn<any>().mockResolvedValue({ ok: true }),
          startTurn: vi.fn<any>().mockResolvedValue({ ok: true, newTurn: { publicId: "new-turn-uuid" } }),
          endRound: vi.fn<any>().mockResolvedValue({ ok: true }),
          endGame: vi.fn<any>().mockResolvedValue({ ok: true }),
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

    const loadGameAggregate = vi.fn<(id: string) => Promise<GameAggregate | null>>().mockResolvedValue(gameState);

    return makeGuessService(mockLogger)({
      gameplayHandler,
      loadGameAggregate,
      loadTurn: mockTurnState,
    });
  };

  const baseInput = {
    gameId: "game-public-id",
    roundNumber: 1,
    userId: 101,
    role: "CODEBREAKER" as const,
    cardWord: "APPLE",
  };

  it("returns success with guess data on correct team card", async () => {
    const gameState = buildGameAggregate();
    const service = createService(gameState);

    const result = await service(baseInput);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.guess.outcome).toBe("CORRECT_TEAM_CARD");
      expect(result.data.guess.cardWord).toBe("APPLE");
      expect(result.data.turn).toBeDefined();
    }
  });

  it("returns failure with message when no current round", async () => {
    const gameState = buildGameAggregate({ currentRound: null });
    const service = createService(gameState);

    const result = await service(baseInput);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("No current round");
    }
  });

  it("propagates message from action when card is invalid", async () => {
    const gameState = buildGameAggregate();
    const service = createService(gameState, { ok: false, message: 'Card "APPLE" has already been selected' });

    const result = await service(baseInput);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe('Card "APPLE" has already been selected');
    }
  });

  it("propagates message from action when game state is invalid", async () => {
    const gameState = buildGameAggregate();
    const service = createService(gameState, { ok: false, message: "Game not in progress" });

    const result = await service(baseInput);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("Game not in progress");
    }
  });

  it("re-throws non-gameplay errors", async () => {
    const gameState = buildGameAggregate();
    const service = createService(gameState, undefined, new Error("Network error"));

    await expect(service(baseInput)).rejects.toThrow("Network error");
  });
});
