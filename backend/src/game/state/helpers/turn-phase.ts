/**
 * Game-rules derivation: given a turn and the round's player roster,
 * compute the active phase of the turn (which role is currently acting).
 *
 *   ACTIVE turn, no clue   → CODEMASTER phase (playerName set)
 *   ACTIVE turn, has clue  → CODEBREAKER phase (playerName null — it's a group)
 *   COMPLETED turn         → null
 */

import { PLAYER_ROLE } from "@codenames/shared/types";
import type { Player, TurnPhase } from "../gameplay-state.types";

export function computeTurnPhase(
  turn: { status: string; _teamId: number; clue?: unknown },
  players: Pick<Player, "publicName" | "teamName" | "_teamId" | "role" | "isAi">[],
): TurnPhase | null {
  if (turn.status !== "ACTIVE") return null;

  const role = turn.clue ? PLAYER_ROLE.CODEBREAKER : PLAYER_ROLE.CODEMASTER;
  const teamPlayers = players.filter(
    (p) => p._teamId === turn._teamId && p.role === role,
  );
  if (teamPlayers.length === 0) return null;

  const isAi = teamPlayers.some((p) => p.isAi);

  return {
    teamName: teamPlayers[0].teamName,
    role: role as "CODEMASTER" | "CODEBREAKER",
    isAi,
    playerName:
      role === PLAYER_ROLE.CODEMASTER ? (teamPlayers[0].publicName ?? null) : null,
  };
}
