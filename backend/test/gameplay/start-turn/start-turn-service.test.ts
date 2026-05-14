import { createStartTurnService } from "@backend/game/gameplay/turns/start/start-turn.service";
import { buildGameAggregate, buildTurn } from "../../__test-utils__/fixtures";
import type { GameAggregate } from "@backend/game/state/types";

vi.mock("@backend/shared/websocket", () => ({
  GameEventsEmitter: {
    turnStarted: vi.fn(),
  },
}));

describe("startTurnService", () => {
  const mockLogger = {
    for: () => ({ withMeta: () => ({ create: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }) }),
    error: vi.fn(),
  } as any;

  const createService = (gameState: GameAggregate | null) => {
    const gameplayHandler = vi.fn<(...args: any[]) => any>().mockImplementation(
      async (_state: any, _player: any, fn: any) => {
        return fn({
          startTurn: vi.fn<any>().mockResolvedValue({ ok: true, newTurn: { publicId: "new-turn-uuid" }, state: buildGameAggregate() }),
        });
      },
    );

    const loadGameAggregate = vi.fn<(id: string) => Promise<GameAggregate | null>>().mockResolvedValue(gameState);

    return createStartTurnService(mockLogger)({ gameplayHandler, loadGameAggregate });
  };

  const baseInput = {
    gameId: "game-public-id",
    roundNumber: 1,
    userId: 101,
  };

  it("returns success when starting next turn", async () => {
    const gameState = buildGameAggregate();
    // Set last turn to COMPLETED so next can start. publicId must match the
    // uuid format required by turnSchema since validateStartTurn re-parses
    // the full aggregate.
    gameState.currentRound!.turns = [
      buildTurn({
        publicId: "00000000-0000-4000-8000-000000000001",
        status: "COMPLETED",
        _teamId: 1,
        teamName: "Red",
      }),
    ];

    const service = createService(gameState);
    const result = await service(baseInput);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.turn.status).toBe("ACTIVE");
      expect(result.data.turn.teamName).toBe("Blue"); // switched from Red
    }
  });

  it("rejects when no current round", async () => {
    const gameState = buildGameAggregate({ currentRound: null });

    const service = createService(gameState);
    const result = await service(baseInput);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.message).toBe("No current round");
  });

  it("rejects when round not in progress", async () => {
    const gameState = buildGameAggregate();
    gameState.currentRound!.status = "COMPLETED";

    const service = createService(gameState);
    const result = await service(baseInput);

    expect(result.success).toBe(false);
    // Schema rejects via z.literal(ROUND_STATE.IN_PROGRESS) refinement on currentRound.status.
    if (!result.success) expect(result.message).toContain("IN_PROGRESS");
  });

  it("rejects when active turn already exists", async () => {
    const gameState = buildGameAggregate(); // Default has an ACTIVE turn

    const service = createService(gameState);
    const result = await service(baseInput);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.message).toContain("Active turn already exists");
  });

  it("rejects when previous turn not completed", async () => {
    const gameState = buildGameAggregate();
    gameState.currentRound!.turns = [];

    const service = createService(gameState);
    const result = await service(baseInput);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.message).toContain("No previous turn found");
  });
});
