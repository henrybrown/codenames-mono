import { createEndTurnService } from "@backend/game/gameplay/turns/end/end-turn.service";
import { buildGameAggregate, buildTurn } from "../../__test-utils__/fixtures";
import type { GameAggregate } from "@backend/game/state/types";

vi.mock("@backend/shared/websocket", () => ({
  GameEventsEmitter: {
    turnEnded: vi.fn(),
    turnStarted: vi.fn(),
  },
}));

describe("endTurnService", () => {
  const mockLogger = {
    for: () => ({ withMeta: () => ({ create: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }) }),
    error: vi.fn(),
  } as any;

  const createService = (gameState: GameAggregate | null) => {
    const gameplayHandler = vi.fn<(...args: any[]) => any>().mockImplementation(
      async (_state: any, _player: any, fn: any) => {
        const opsState = buildGameAggregate();
        return fn({
          endTurn: vi.fn<any>().mockResolvedValue({ ok: true, state: opsState }),
          startTurn: vi.fn<any>().mockResolvedValue({ ok: true, newTurn: { publicId: "new-turn-uuid" }, state: opsState }),
        });
      },
    );

    const loadGameAggregate = vi.fn<(id: string) => Promise<GameAggregate | null>>().mockResolvedValue(gameState);

    return createEndTurnService(mockLogger)({ gameplayHandler, loadGameAggregate });
  };

  const baseInput = {
    gameId: "game-public-id",
    roundNumber: 1,
    userId: 101,
    role: "CODEBREAKER" as const,
  };

  it("returns success when codebreaker ends turn", async () => {
    const gameState = buildGameAggregate();
    // Ensure turn has a clue (codebreaker phase)
    gameState.currentRound!.turns[0].clue = { _id: 1, _turnId: 1, word: "FRUIT", number: 2, createdAt: new Date() };

    const service = createService(gameState);
    const result = await service(baseInput);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.turn.status).toBe("COMPLETED");
    }
  });

  it("rejects when no current round", async () => {
    const gameState = buildGameAggregate({ currentRound: null });

    const service = createService(gameState);
    const result = await service(baseInput);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.message).toBe("No current round");
  });

  it("rejects when no active turn (turn already completed)", async () => {
    const gameState = buildGameAggregate();
    gameState.currentRound!.turns = [buildTurn({ status: "COMPLETED" })];

    const service = createService(gameState);
    const result = await service(baseInput);

    expect(result.success).toBe(false);
    // No active turn → findPlayerByActiveRole returns null → service rejects at resolvePlayer.
    if (!result.success) expect(result.message).toBe("No player for that role on the active turn");
  });
});
