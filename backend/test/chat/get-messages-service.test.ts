import { getMessagesService } from "@backend/chat/queries/get-messages.service";
import type {
  GameMessageData,
  MessageQueryParams,
} from "@backend/shared/data-access/repositories/game-messages.repository";
import { buildGameAggregate } from "../__test-utils__/fixtures";

describe("getMessagesService", () => {
  const findMessagesByGame = vi.fn<(params: MessageQueryParams) => Promise<GameMessageData[]>>();
  const getGameplayState = vi.fn<any>();

  const makeRow = (overrides: Partial<GameMessageData> = {}): GameMessageData => ({
    id: "msg-1",
    game_id: 1,
    player_id: 101,
    team_id: 1,
    team_only: false,
    message_type: "CHAT",
    content: "hello",
    created_at: new Date("2025-01-01T00:00:00Z"),
    ...overrides,
  });

  const createService = () =>
    getMessagesService({ findMessagesByGame, getGameplayState: getGameplayState as any });

  beforeEach(() => {
    findMessagesByGame.mockReset();
    getGameplayState.mockReset();
  });

  it("returns messages for a valid game and user", async () => {
    const state = buildGameAggregate();
    const userId = state.teams[0].players[0]._userId;
    getGameplayState.mockResolvedValue({ status: "found", data: state });
    findMessagesByGame.mockResolvedValue([makeRow()]);

    const result = await createService()("game-1", userId);

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.messages).toHaveLength(1);
    }
  });

  it("returns game-not-found when game doesn't exist", async () => {
    getGameplayState.mockResolvedValue({ status: "game-not-found", gameId: "game-1" });

    const result = await createService()("game-1", 1);

    expect(result.status).toBe("game-not-found");
  });

  it("returns unauthorized when user is not a player", async () => {
    getGameplayState.mockResolvedValue({
      status: "user-not-in-game",
      gameId: "game-1",
      userId: 999,
    });

    const result = await createService()("game-1", 999);

    expect(result.status).toBe("unauthorized");
  });

  it("passes requestingTeamId to the repo based on the user's team", async () => {
    const state = buildGameAggregate();
    const player = state.teams[0].players[0];
    getGameplayState.mockResolvedValue({ status: "found", data: state });
    findMessagesByGame.mockResolvedValue([]);

    await createService()("game-1", player._userId);

    expect(findMessagesByGame).toHaveBeenCalledWith(
      expect.objectContaining({ requestingTeamId: player._teamId }),
    );
  });

  it("respects the `since` timestamp parameter", async () => {
    const state = buildGameAggregate();
    getGameplayState.mockResolvedValue({ status: "found", data: state });
    findMessagesByGame.mockResolvedValue([]);
    const sinceIso = "2025-01-01T12:00:00.000Z";

    await createService()("game-1", state.teams[0].players[0]._userId, { since: sinceIso });

    expect(findMessagesByGame).toHaveBeenCalledWith(
      expect.objectContaining({ since: new Date(sinceIso) }),
    );
  });

  it("respects the `limit` parameter", async () => {
    const state = buildGameAggregate();
    getGameplayState.mockResolvedValue({ status: "found", data: state });
    findMessagesByGame.mockResolvedValue([]);

    await createService()("game-1", state.teams[0].players[0]._userId, { limit: 25 });

    expect(findMessagesByGame).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 25 }),
    );
  });

  it("returns an empty array when no messages exist", async () => {
    const state = buildGameAggregate();
    getGameplayState.mockResolvedValue({ status: "found", data: state });
    findMessagesByGame.mockResolvedValue([]);

    const result = await createService()("game-1", state.teams[0].players[0]._userId);

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.messages).toEqual([]);
    }
  });

  it("transforms rows and enriches with player publicId/name from game state", async () => {
    const state = buildGameAggregate();
    const player = state.teams[0].players[0];
    getGameplayState.mockResolvedValue({ status: "found", data: state });
    const row = makeRow({
      id: "msg-xyz",
      player_id: player._id,
      team_id: player._teamId,
      team_only: true,
      message_type: "CHAT",
      content: "hi team",
      created_at: new Date("2025-06-15T10:30:00Z"),
    });
    findMessagesByGame.mockResolvedValue([row]);

    const result = await createService()("game-1", player._userId);

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.messages[0]).toEqual({
        id: "msg-xyz",
        gameId: "game-1",
        playerId: player.publicId,
        playerName: player.publicName,
        teamName: player.teamName,
        teamOnly: true,
        messageType: "CHAT",
        content: "hi team",
        createdAt: "2025-06-15T10:30:00.000Z",
      });
      // Ensure no internal DB _id fields leak into the response
      expect(result.messages[0]).not.toHaveProperty("teamId");
      expect(result.messages[0]).not.toHaveProperty("_id");
      expect(result.messages[0]).not.toHaveProperty("_teamId");
    }
  });

  it("returns null player fields when player_id doesn't match any player in state", async () => {
    const state = buildGameAggregate();
    getGameplayState.mockResolvedValue({ status: "found", data: state });
    findMessagesByGame.mockResolvedValue([
      makeRow({ player_id: null, message_type: "SYSTEM", content: "notice" }),
    ]);

    const result = await createService()("game-1", state.teams[0].players[0]._userId);

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.messages[0].playerId).toBeNull();
      expect(result.messages[0].playerName).toBeNull();
      expect(result.messages[0].teamName).toBeNull();
    }
  });
});
