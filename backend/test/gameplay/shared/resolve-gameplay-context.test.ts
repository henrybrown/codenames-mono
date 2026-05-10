import { createResolveGameplayContext } from "@backend/game/gameplay/shared/resolve-gameplay-context";
import { buildGameAggregate, buildTurn } from "../../__test-utils__/fixtures";
import type { GameAggregate } from "@backend/game/gameplay/state/gameplay-state.types";
import type {
  GameplayStateProvider,
  GameplayStateResult,
} from "@backend/game/gameplay/state/get-gameplay-state";

const okFor = (game: GameAggregate, playerIndex: { teamIdx: number; playerIdx: number }): GameplayStateResult => {
  const player = game.teams[playerIndex.teamIdx].players[playerIndex.playerIdx];
  return {
    status: "found",
    data: {
      ...game,
      playerContext: {
        _id: player._id,
        publicId: player.publicId,
        _userId: player._userId,
        _teamId: player._teamId,
        publicName: player.publicName,
        teamName: player.teamName,
        username: player.publicName,
        role: player.role as any,
      },
    },
  };
};

describe("resolveGameplayContext.fromRole", () => {
  const makeResolver = (result: GameplayStateResult) => {
    const getGameplayState = vi.fn<GameplayStateProvider>().mockResolvedValue(result);
    const resolver = createResolveGameplayContext({ getGameplayState });
    return { resolver, getGameplayState };
  };

  it("resolves CODEMASTER on active turn's team", async () => {
    const game = buildGameAggregate();
    const userId = game.teams[0].players[0]._userId;
    const { resolver, getGameplayState } = makeResolver(okFor(game, { teamIdx: 0, playerIdx: 0 }));

    const result = await resolver.fromRole("game-public-id", userId, "CODEMASTER");

    expect(getGameplayState).toHaveBeenCalledWith({
      gameId: "game-public-id",
      userId,
      role: "CODEMASTER",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.gameState.playerContext).not.toBeNull();
      expect(result.gameState.playerContext!.role).toBe("CODEMASTER");
      expect(result.gameState.playerContext!.teamName).toBe("Red");
    }
  });

  it("resolves CODEBREAKER on active turn's team", async () => {
    const game = buildGameAggregate();
    const userId = game.teams[0].players[1]._userId;
    const { resolver } = makeResolver(okFor(game, { teamIdx: 0, playerIdx: 1 }));

    const result = await resolver.fromRole("game-public-id", userId, "CODEBREAKER");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.gameState.playerContext!.role).toBe("CODEBREAKER");
    }
  });

  it("returns game-not-found when game doesn't exist", async () => {
    const { resolver } = makeResolver({ status: "game-not-found", gameId: "bad-id" });

    const result = await resolver.fromRole("bad-id", 1, "CODEMASTER");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("game-not-found");
    }
  });

  it("returns user-not-in-game when userId doesn't match any player", async () => {
    const { resolver } = makeResolver({
      status: "user-not-in-game",
      gameId: "game-public-id",
      userId: 99999,
    });

    const result = await resolver.fromRole("game-public-id", 99999, "CODEMASTER");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("user-not-in-game");
    }
  });

  it("returns no-active-turn when no turn is active", async () => {
    const { resolver } = makeResolver({
      status: "no-active-turn",
      gameId: "game-public-id",
    });
    const game = buildGameAggregate();
    game.currentRound!.turns = [
      buildTurn({ status: "COMPLETED", _teamId: 1, teamName: "Red" }),
    ];

    const result = await resolver.fromRole("game-public-id", game.teams[0].players[0]._userId, "CODEMASTER");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("no-active-turn");
    }
  });

  it("returns no-player-for-role when role doesn't exist on team", async () => {
    const { resolver } = makeResolver({
      status: "no-player-for-role",
      role: "CODEMASTER",
      teamName: "Red",
    });

    const result = await resolver.fromRole("game-public-id", 1, "CODEMASTER");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("no-player-for-role");
    }
  });
});
