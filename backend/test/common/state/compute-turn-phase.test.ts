import { computeTurnPhase } from "@backend/game/state/gameplay-state.helpers";
import { buildPlayer } from "../../__test-utils__/fixtures";

describe("computeTurnPhase", () => {
  const redCM = buildPlayer({ _teamId: 1, teamName: "Red", role: "CODEMASTER", publicName: "Alice", isAi: false });
  const redCB = buildPlayer({ _teamId: 1, teamName: "Red", role: "CODEBREAKER", publicName: "Bob", isAi: false });
  const blueCM = buildPlayer({ _teamId: 2, teamName: "Blue", role: "CODEMASTER", publicName: "Charlie", isAi: false });
  const players = [redCM, redCB, blueCM];

  it("returns CODEMASTER phase with playerName when turn has no clue", () => {
    const turn = { status: "ACTIVE", _teamId: 1 };
    const result = computeTurnPhase(turn, players);

    expect(result).toEqual({
      teamName: "Red",
      role: "CODEMASTER",
      isAi: false,
      playerName: "Alice",
    });
  });

  it("returns CODEBREAKER phase with null playerName when turn has a clue", () => {
    const turn = { status: "ACTIVE", _teamId: 1, clue: { word: "test", number: 2 } };
    const result = computeTurnPhase(turn, players);

    expect(result).toEqual({
      teamName: "Red",
      role: "CODEBREAKER",
      isAi: false,
      playerName: null,
    });
  });

  it("returns null for COMPLETED turn", () => {
    const turn = { status: "COMPLETED", _teamId: 1 };
    expect(computeTurnPhase(turn, players)).toBeNull();
  });

  it("returns null when no matching player for role", () => {
    const turn = { status: "ACTIVE", _teamId: 99 }; // no team 99
    expect(computeTurnPhase(turn, players)).toBeNull();
  });

  it("sets isAi true when any team player for the role is AI", () => {
    const aiCB = buildPlayer({ _teamId: 1, teamName: "Red", role: "CODEBREAKER", publicName: "AI Bot", isAi: true });
    const turn = { status: "ACTIVE", _teamId: 1, clue: { word: "test", number: 1 } };

    const result = computeTurnPhase(turn, [redCM, redCB, aiCB]);
    expect(result?.isAi).toBe(true);
  });

  it("handles multiple codebreakers without error", () => {
    const cb2 = buildPlayer({ _teamId: 1, teamName: "Red", role: "CODEBREAKER", publicName: "Eve", isAi: false });
    const turn = { status: "ACTIVE", _teamId: 1, clue: { word: "test", number: 1 } };

    const result = computeTurnPhase(turn, [redCM, redCB, cb2]);
    expect(result).not.toBeNull();
    expect(result!.role).toBe("CODEBREAKER");
    expect(result!.playerName).toBeNull(); // codebreaker group, no specific name
  });
});
