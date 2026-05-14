import { giveClueService } from "@backend/game/gameplay/turns/clue/give-clue.service";
import { buildGameAggregate, buildTurn } from "../../__test-utils__/fixtures";
import type { GameAggregate } from "@backend/game/state/types";

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

  const createService = (gameState: GameAggregate | null, opsGiveClueResult?: any) => {
    const opsGameState = buildGameAggregate();
    const gameplayHandler = vi.fn<(...args: any[]) => any>().mockImplementation(
      async (_state: any, _player: any, fn: any) => {
        return fn({
          state: vi.fn<any>().mockResolvedValue(opsGameState),
          giveClue: vi.fn<any>().mockResolvedValue(
            opsGiveClueResult ?? {
              ok: true,
              clue: { word: "FRUIT", number: 2, createdAt: new Date() },
              turn: { _id: 1 },
            },
          ),
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

    const loadGameAggregate = vi.fn<(id: string) => Promise<GameAggregate | null>>().mockResolvedValue(gameState);

    return giveClueService(mockLogger)({
      gameplayHandler,
      loadGameAggregate,
      loadTurn: mockTurnState,
    });
  };

  const baseInput = {
    gameId: "game-public-id",
    roundNumber: 1,
    userId: 101,
    role: "CODEMASTER" as const,
    word: "FRUIT",
    targetCardCount: 2,
  };

  it("returns success with clue and turn data on valid input", async () => {
    const gameState = buildGameAggregate();
    const service = createService(gameState);

    const result = await service(baseInput);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clue.word).toBe("FRUIT");
      expect(result.data.clue.targetCardCount).toBe(2);
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

  it("propagates message from action when validation fails", async () => {
    const gameState = buildGameAggregate();
    const service = createService(gameState, { ok: false, message: "Only codemasters can give clues" });

    const result = await service(baseInput);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("Only codemasters can give clues");
    }
  });

  it("propagates message from action when clue word is invalid", async () => {
    const gameState = buildGameAggregate();
    const service = createService(gameState, { ok: false, message: 'Clue word "APPLE" matches a card word' });

    const result = await service({ ...baseInput, word: "APPLE" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe('Clue word "APPLE" matches a card word');
    }
  });
});
