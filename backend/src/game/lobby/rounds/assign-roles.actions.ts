import { PLAYER_ROLE } from "@codenames/shared/types";
import type {
  RoleAssignmentCreator,
  RoleIdsByNameFinder,
} from "@backend/shared/data-access/repositories/player-roles.repository";
import type { AssignRolesValidLobbyState } from "./assign-roles.rules";

type RoleAssignmentInput = {
  playerId: number;
  roundId: number;
  roleId: number;
  teamId: number;
};

/**
 * Factory function that creates a random role assignment action.
 *
 * Resolves the role-name → role-id mapping once per invocation (the
 * player_roles table is a small reference table), then assigns one
 * codemaster per team and codebreaker for everyone else.
 *
 * Codemaster selection prefers players who haven't been codemaster
 * before in this game; falls back to random across the full roster
 * if everyone already has been.
 */
export const assignRolesRandomly = (
  assignPlayerRoles: RoleAssignmentCreator,
  getPreviousCodemasters: (gameId: number) => Promise<number[]>,
  findRoleIdsByName: RoleIdsByNameFinder,
) => {
  return async (gameState: AssignRolesValidLobbyState) => {
    const roleIds = await findRoleIdsByName();
    const codemasterId = roleIds[PLAYER_ROLE.CODEMASTER];
    const codebreakerId = roleIds[PLAYER_ROLE.CODEBREAKER];

    const previousCodemasters = await getPreviousCodemasters(gameState._id);

    const assignments: RoleAssignmentInput[] = [];

    for (const team of gameState.teams) {
      const eligiblePlayers = team.players.filter(
        (player) => !previousCodemasters.includes(player._id),
      );

      // If all players have been codemaster, fall back to the full
      // roster. Without this, eligiblePlayers can be empty and the
      // random pick returns undefined, which then breaks the role
      // assignment below when reading `selectedCodemaster._id`.
      const codemasterPool =
        eligiblePlayers.length > 0 ? eligiblePlayers : team.players;

      const selectedCodemaster =
        codemasterPool[Math.floor(Math.random() * codemasterPool.length)];

      for (const player of team.players) {
        assignments.push({
          playerId: player._id,
          roundId: gameState.currentRound._id,
          roleId:
            player._id === selectedCodemaster._id
              ? codemasterId
              : codebreakerId,
          teamId: player._teamId,
        });
      }
    }

    return await assignPlayerRoles(assignments);
  };
};

/** Bound role-assignment action. */
export type RoleAssigner = ReturnType<typeof assignRolesRandomly>;
