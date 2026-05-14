import {
  checkRoundWinner,
  checkGameWinner,
  getTeamScores,
} from "@backend/game/gameplay/rounds/winning-conditions";
import { buildCard } from "../../__test-utils__/fixtures";

describe("winningConditions", () => {
  describe("checkRoundWinner", () => {
    it("returns guessingTeamId when all their cards are selected", () => {
      const cards = [
        buildCard({ _teamId: 1, teamName: "Red", selected: true }),
        buildCard({ _teamId: 1, teamName: "Red", selected: true }),
        buildCard({ _teamId: 2, teamName: "Blue", selected: false }),
        buildCard({ _teamId: 2, teamName: "Blue", selected: false }),
        buildCard({ _teamId: null, cardType: "BYSTANDER", selected: false }),
      ];

      const winner = checkRoundWinner(cards, 1, 2);
      expect(winner).toBe(1);
    });

    it("returns otherTeamId when all their cards are selected", () => {
      const cards = [
        buildCard({ _teamId: 1, teamName: "Red", selected: false }),
        buildCard({ _teamId: 2, teamName: "Blue", selected: true }),
        buildCard({ _teamId: 2, teamName: "Blue", selected: true }),
        buildCard({ _teamId: null, cardType: "BYSTANDER", selected: false }),
      ];

      const winner = checkRoundWinner(cards, 1, 2);
      expect(winner).toBe(2);
    });

    it("returns null when neither team has all cards selected", () => {
      const cards = [
        buildCard({ _teamId: 1, teamName: "Red", selected: true }),
        buildCard({ _teamId: 1, teamName: "Red", selected: false }),
        buildCard({ _teamId: 2, teamName: "Blue", selected: false }),
      ];

      const winner = checkRoundWinner(cards, 1, 2);
      expect(winner).toBeNull();
    });
  });

  describe("checkGameWinner", () => {
    it("returns winner for QUICK format (1 round won)", () => {
      const rounds = [
        { _id: 1, number: 1, status: "COMPLETED" as const, _winningTeamId: 1, winningTeamName: "Red", createdAt: new Date() },
      ];

      const winner = checkGameWinner(rounds, "QUICK");
      expect(winner).toBe(1);
    });

    it("returns winner for BEST_OF_THREE (2 rounds won)", () => {
      const rounds = [
        { _id: 1, number: 1, status: "COMPLETED" as const, _winningTeamId: 1, winningTeamName: "Red", createdAt: new Date() },
        { _id: 2, number: 2, status: "COMPLETED" as const, _winningTeamId: 2, winningTeamName: "Blue", createdAt: new Date() },
        { _id: 3, number: 3, status: "COMPLETED" as const, _winningTeamId: 1, winningTeamName: "Red", createdAt: new Date() },
      ];

      const winner = checkGameWinner(rounds, "BEST_OF_THREE");
      expect(winner).toBe(1);
    });

    it("returns null for BEST_OF_THREE when tied", () => {
      const rounds = [
        { _id: 1, number: 1, status: "COMPLETED" as const, _winningTeamId: 1, winningTeamName: "Red", createdAt: new Date() },
        { _id: 2, number: 2, status: "COMPLETED" as const, _winningTeamId: 2, winningTeamName: "Blue", createdAt: new Date() },
      ];

      const winner = checkGameWinner(rounds, "BEST_OF_THREE");
      expect(winner).toBeNull();
    });
  });

  describe("getTeamScores", () => {
    it("counts wins per team correctly", () => {
      const rounds = [
        { _id: 1, number: 1, status: "COMPLETED" as const, _winningTeamId: 1, winningTeamName: "Red", createdAt: new Date() },
        { _id: 2, number: 2, status: "COMPLETED" as const, _winningTeamId: 2, winningTeamName: "Blue", createdAt: new Date() },
        { _id: 3, number: 3, status: "COMPLETED" as const, _winningTeamId: 1, winningTeamName: "Red", createdAt: new Date() },
      ];

      const scores = getTeamScores(rounds);
      expect(scores[1]).toBe(2);
      expect(scores[2]).toBe(1);
    });
  });
});
