/**
 * Tests for complexProperties accessor functions (gameplay-state.helpers.ts)
 *
 * All pure functions on GameAggregate — no mocks needed.
 */
import {
  getCurrentTurn,
  getOtherTeamId,
  getRoundCount,
  findRoundByNumber,
  getLatestRoundOrThrow,
} from "@backend/game/state/gameplay-state.helpers";
import { buildGameAggregate, buildTurn, buildRound, resetIds } from "../../__test-utils__/fixtures";

describe("complexProperties", () => {
  beforeEach(() => resetIds());

  describe("getCurrentTurn", () => {
    it("returns the active turn", () => {
      const game = buildGameAggregate();
      const turn = getCurrentTurn(game);
      expect(turn).not.toBeNull();
      expect(turn!.status).toBe("ACTIVE");
    });

    it("returns null when no active turn exists", () => {
      const game = buildGameAggregate({
        currentRound: buildRound({
          turns: [buildTurn({ status: "COMPLETED" })],
        }),
      });
      const turn = getCurrentTurn(game);
      expect(turn).toBeNull();
    });

    it("returns null when no current round", () => {
      const game = buildGameAggregate({ currentRound: null });
      expect(getCurrentTurn(game)).toBeNull();
    });
  });

  describe("getOtherTeamId", () => {
    it("returns the other team ID", () => {
      const game = buildGameAggregate();
      expect(getOtherTeamId(game, 1)).toBe(2);
      expect(getOtherTeamId(game, 2)).toBe(1);
    });

    it("throws when there is only one team", () => {
      const game = buildGameAggregate({
        teams: [{ _id: 1, _gameId: 1, teamName: "Red", players: [] }],
      });
      expect(() => getOtherTeamId(game, 1)).toThrow(
        "No other team found",
      );
    });
  });

  describe("getRoundCount", () => {
    it("counts current + historical rounds", () => {
      const game = buildGameAggregate({
        historicalRounds: [
          { _id: 10, number: 1, status: "COMPLETED", _winningTeamId: 1, winningTeamName: "Red", createdAt: new Date() },
        ],
      });
      expect(getRoundCount(game)).toBe(2);
    });

    it("returns 0 when no rounds", () => {
      const game = buildGameAggregate({
        currentRound: null,
        historicalRounds: [],
      });
      expect(getRoundCount(game)).toBe(0);
    });
  });

  describe("findRoundByNumber", () => {
    it("returns current round when number matches", () => {
      const game = buildGameAggregate();
      const round = findRoundByNumber(game, 1);
      expect(round).not.toBeNull();
      expect(round!._id).toBe(game.currentRound!._id);
    });

    it("returns historical round by number", () => {
      const game = buildGameAggregate({
        currentRound: buildRound({ number: 2 }),
        historicalRounds: [
          { _id: 10, number: 1, status: "COMPLETED", _winningTeamId: 1, winningTeamName: "Red", createdAt: new Date() },
        ],
      });
      const round = findRoundByNumber(game, 1);
      expect(round).not.toBeNull();
      expect(round!._id).toBe(10);
    });

    it("returns null when round not found", () => {
      const game = buildGameAggregate();
      expect(findRoundByNumber(game, 99)).toBeNull();
    });
  });

  describe("getLatestRoundOrThrow", () => {
    it("returns current round", () => {
      const game = buildGameAggregate();
      expect(() => getLatestRoundOrThrow(game)).not.toThrow();
    });

    it("throws when no current round", () => {
      const game = buildGameAggregate({ currentRound: null });
      expect(() => getLatestRoundOrThrow(game)).toThrow(
        "No current round found",
      );
    });
  });
});
