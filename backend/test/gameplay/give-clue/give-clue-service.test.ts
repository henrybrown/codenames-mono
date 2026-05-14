import { giveClueService } from "@backend/game/gameplay/turns/clue/give-clue.service";
import { buildGameAggregate, buildTurn } from "../../__test-utils__/fixtures";
import type { GameAggregate } from "@backend/game/state/types";
import type { GamePlayer } from "@backend/game/access";

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

  const createService = (opsGiveClueResult?: any) => {
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

    return giveClueService(mockLogger)({
      gameplayHandler,
      loadTurn: mockTurnState,
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

  it("returns failure with message when no current round", async () => {
    const service = createService();
    const gameState = buildGameAggregate({ currentRound: null });

    const result = await service({ gameState, playerContext: playerCtx, word: "FRUIT", targetCardCount: 2 });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("No current round");
    }
  });

  it("propagates message from action when validation fails", async () => {
    const service = createService({ ok: false, message: "Only codemasters can give clues" });
    const gameState = buildGameAggregate();

    const result = await service({ gameState, playerContext: playerCtx, word: "FRUIT", targetCardCount: 2 });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("Only codemasters can give clues");
    }
  });

  it("propagates message from action when clue word is invalid", async () => {
    const service = createService({ ok: false, message: 'Clue word "APPLE" matches a card word' });
    const gameState = buildGameAggregate();

    const result = await service({ gameState, playerContext: playerCtx, word: "APPLE", targetCardCount: 2 });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe('Clue word "APPLE" matches a card word');
    }
  });
});
