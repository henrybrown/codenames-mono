import { buildGameAggregate } from "../__test-utils__/fixtures";
import type {
  GameMessageData,
  CreateMessageInput,
} from "@backend/shared/data-access/repositories/game-messages.repository";

import { submitMessageService } from "@backend/chat/submit/submit-message.service";

describe("submitMessageService", () => {
  const createGameMessage = vi.fn<(input: CreateMessageInput) => Promise<GameMessageData>>();
  const loadGameAggregate = vi.fn<any>();

  const makeRow = (overrides: Partial<GameMessageData> = {}): GameMessageData => ({
    id: "msg-new",
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
    submitMessageService({ createGameMessage, loadGameAggregate: loadGameAggregate as any });

  beforeEach(() => {
    createGameMessage.mockReset();
    loadGameAggregate.mockReset();
  });

  it("returns success with message data on valid input", async () => {
    const state = buildGameAggregate();
    const player = state.teams[0].players[0];
    loadGameAggregate.mockResolvedValue(state);
    createGameMessage.mockResolvedValue(makeRow({ content: "hi there" }));

    const result = await createService()("game-1", player._userId, {
      content: "hi there",
      teamOnly: false,
    });

    expect(result.status).toBe("success");
  });

  it("returned message uses player publicId/publicName/teamName and never DB _id fields", async () => {
    const state = buildGameAggregate();
    const player = state.teams[0].players[0];
    loadGameAggregate.mockResolvedValue(state);
    createGameMessage.mockResolvedValue(makeRow({ id: "msg-9" }));

    const result = await createService()("game-1", player._userId, {
      content: "hello",
      teamOnly: false,
    });

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.message.playerId).toBe(player.publicId);
      expect(result.message.playerName).toBe(player.publicName);
      expect(result.message.teamName).toBe(player.teamName);
      // Ensure no internal DB _id fields leak into the response
      expect(result.message).not.toHaveProperty("teamId");
      expect(result.message).not.toHaveProperty("_id");
      expect(result.message).not.toHaveProperty("_teamId");
      expect(result.message).not.toHaveProperty("_playerId");
    }
  });

  it("for team-only messages, returns audienceTeamId", async () => {
    const state = buildGameAggregate();
    const player = state.teams[0].players[0];
    loadGameAggregate.mockResolvedValue(state);
    createGameMessage.mockResolvedValue(makeRow());

    const result = await createService()("game-1", player._userId, { content: "secret", teamOnly: true });

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.audienceTeamId).toBe(player._teamId);
    }
  });

  it("for public messages, returns undefined audienceTeamId", async () => {
    const state = buildGameAggregate();
    const player = state.teams[0].players[0];
    loadGameAggregate.mockResolvedValue(state);
    createGameMessage.mockResolvedValue(makeRow());

    const result = await createService()("game-1", player._userId, { content: "public", teamOnly: false });

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.audienceTeamId).toBeUndefined();
    }
  });

  it("returns invalid-input when content is empty", async () => {
    const result = await createService()("game-1", 1, { content: "   ", teamOnly: false });
    expect(result.status).toBe("invalid-input");
    expect(loadGameAggregate).not.toHaveBeenCalled();
  });

  it("returns invalid-input when content exceeds 1000 chars", async () => {
    const result = await createService()("game-1", 1, {
      content: "a".repeat(1001),
      teamOnly: false,
    });
    expect(result.status).toBe("invalid-input");
  });

  it("returns game-not-found when game doesn't exist", async () => {
    loadGameAggregate.mockResolvedValue(null);

    const result = await createService()("game-1", 1, { content: "hi", teamOnly: false });

    expect(result.status).toBe("game-not-found");
  });

  it("returns unauthorized when user is not a player in the game", async () => {
    const state = buildGameAggregate();
    loadGameAggregate.mockResolvedValue(state);

    const result = await createService()("game-1", 999_999, { content: "hi", teamOnly: false });

    expect(result.status).toBe("unauthorized");
  });

  it("trims whitespace from message content before saving", async () => {
    const state = buildGameAggregate();
    const player = state.teams[0].players[0];
    loadGameAggregate.mockResolvedValue(state);
    createGameMessage.mockResolvedValue(makeRow());

    await createService()("game-1", player._userId, {
      content: "   hello world   ",
      teamOnly: false,
    });

    expect(createGameMessage).toHaveBeenCalledWith(
      expect.objectContaining({ content: "hello world" }),
    );
  });
});
