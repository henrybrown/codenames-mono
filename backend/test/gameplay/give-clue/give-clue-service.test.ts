import { giveClueService } from "@backend/game/gameplay/turns/clue/give-clue.service";
import { buildGameAggregate, buildTurn } from "../../__test-utils__/fixtures";
import type { GameAggregate } from "@backend/game/state/gameplay-state.types";
import type { GamePlayer } from "@backend/game/access";
import { GameplayValidationError } from "@backend/game/gameplay/errors/gameplay.errors";

const playerCtx: GamePlayer = {
  _id: 1,
  publicId: "player-1",
  _userId: 101,
  _teamId: 1,
  teamName: "Red",
  publicName: "Alice",
  role: "CODEMASTER",
};

// Mock WebSocket events (fire-and-forget, don't need real implementation)
vi.mock("@backend/shared/websocket", () => ({
  GameEventsEmitter: {
    clueGiven: vi.fn(),
  },
}));

describe("giveClueService", () => {
  const mockLogger = {
    for: () => ({ withMeta: () => ({ create: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }) }),
    error: vi.fn(),
  } as any;

  const mockTurnState = vi.fn<(...args: any[]) => any>();

  const createService = (handlerResult: any = null, handlerThrows: Error | null = null) => {
    const gameplayHandler = vi.fn<(...args: any[]) => any>().mockImplementation(
      async (_state: any, fn: any) => {
        if (handlerThrows) throw handlerThrows;
        return fn({
          giveClue: vi.fn<any>().mockResolvedValue(handlerResult ?? {
            clue: { word: "FRUIT", number: 2, createdAt: new Date() },
            turn: { _id: 1 },
            state: buildGameAggregate(),
          }),
        });
      },
    );

    // Mock turn state to return turn data for response building
    mockTurnState.mockResolvedValue({
      publicId: "turn-uuid",
      teamName: "Red",
      status: "ACTIVE",
      guessesRemaining: 3,
      createdAt: new Date(),
      completedAt: null,
      clue: { word: "FRUIT", number: 2, createdAt: new Date() },
      hasGuesses: false,
      prevGuesses: [],
    });

    return giveClueService(mockLogger)({
      gameplayHandler,
      getTurnState: mockTurnState,
    });
  };

  it("returns success with clue and turn data on valid input", async () => {
    const service = createService();
    const gameState = buildGameAggregate();

    const result = await service({ gameState, playerContext: playerCtx, word: "FRUIT", targetCardCount: 2 });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clue.word).toBe("FRUIT");
      expect(result.data.clue.targetCardCount).toBe(2);
      expect(result.data.turn).toBeDefined();
    }
  });

  it("returns round-not-found when no current round", async () => {
    const service = createService();
    const gameState = buildGameAggregate({ currentRound: null });

    const result = await service({ gameState, playerContext: playerCtx, word: "FRUIT", targetCardCount: 2 });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.status).toBe("round-not-found");
    }
  });

  it("returns invalid-game-state when handler throws GameplayValidationError", async () => {
    const service = createService(null, new GameplayValidationError("give clue", [
      { path: "role", message: "Only codemasters can give clues" },
    ]));

    const gameState = buildGameAggregate();
    const result = await service({ gameState, playerContext: playerCtx, word: "FRUIT", targetCardCount: 2 });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.status).toBe("invalid-game-state");
    }
  });

  it("returns invalid-clue-word when handler throws clue word validation error", async () => {
    const service = createService(null, new GameplayValidationError("clue word", [
      { path: "word", message: "Clue word matches a card word" },
    ]));

    const gameState = buildGameAggregate();
    const result = await service({ gameState, playerContext: playerCtx, word: "APPLE", targetCardCount: 2 });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.status).toBe("invalid-clue-word");
    }
  });

  it("re-throws non-gameplay errors", async () => {
    const service = createService(null, new Error("DB connection lost"));
    const gameState = buildGameAggregate();

    await expect(service({ gameState, word: "FRUIT", targetCardCount: 2 })).rejects.toThrow("DB connection lost");
  });
});
