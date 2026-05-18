import { Kysely } from "kysely";
import { DB } from "../../db/db.types";
import { UnexpectedRepositoryError } from "./repository.errors";

import { PlayerRole, PLAYER_ROLE } from "@codenames/shared/types";

/** Player primary-key id. */
export type PlayerId = number;
/** Public-facing player UUID. */
export type PublicPlayerId = string;
/** Round primary-key id. */
export type RoundId = number;
/** Team primary-key id. */
export type TeamId = number;
/** Role primary-key id from the `player_roles` lookup table. */
export type RoleId = number;

/** Raw DB row shape for player_round_roles. */
export type PlayerRoundRoleData = {
  _player_id: number;
  _round_id: number;
  _role_id: number;
  assigned_at: Date;
};

/** Input for assigning a role to a player on a round. */
export type PlayerRoleInput = {
  playerId: number;
  roundId: number;
  roleId: number;
  teamId: number;
};

/** Service-layer projection of a role assignment row. */
export type RoleAssignmentResult = {
  _playerId: number;
  _roundId: number;
  _teamId: number;
  role: PlayerRole;
};

/** Lookup-by-round signature returning all role assignments. */
export type RoleAssignmentsFinder = (
  roundId: RoundId,
) => Promise<RoleAssignmentResult[]>;

/** Signature for assigning one or more role rows. */
export type RoleAssignmentCreator = (
  input: PlayerRoleInput | PlayerRoleInput[],
) => Promise<RoleAssignmentResult[]>;

/** Returns a map of role name → internal role id. */
export type RoleIdsByNameFinder = () => Promise<Record<PlayerRole, number>>;

/** Builds a finder returning all role assignments for a round. */
export const getRoundRoleAssignments =
  (db: Kysely<DB>): RoleAssignmentsFinder =>
  async (roundId) => {
    try {
      const roleAssignments = await db
        .selectFrom("player_round_roles")
        .innerJoin(
          "player_roles",
          "player_round_roles.role_id",
          "player_roles.id",
        )
        .innerJoin("players", "player_round_roles.player_id", "players.id")
        .where("player_round_roles.round_id", "=", roundId)
        .select([
          "player_round_roles.player_id as playerId",
          "player_round_roles.round_id as roundId",
          "player_roles.role_name as roleName",
          "players.team_id as teamId",
        ])
        .execute();

      return roleAssignments.map((assignment) => ({
        _playerId: assignment.playerId,
        _roundId: assignment.roundId,
        _teamId: assignment.teamId,
        role: mapRoleNameToEnum(assignment.roleName),
      }));
    } catch (error) {
      throw new UnexpectedRepositoryError(
        `Failed to retrieve role assignments for round ${roundId}`,
        { cause: error },
      );
    }
  };

/** Builds a creator that inserts one or more role-assignment rows. */
export const assignPlayerRoles =
  (db: Kysely<DB>): RoleAssignmentCreator =>
  async (input) => {
    try {
      const inputArray = Array.isArray(input) ? input : [input];

      if (inputArray.length === 0) {
        return [];
      }

      const values = inputArray.map((assignment) => ({
        player_id: assignment.playerId,
        round_id: assignment.roundId,
        role_id: assignment.roleId,
        assigned_at: new Date(),
      }));

      await db.insertInto("player_round_roles").values(values).execute();

      const assignmentPromises = inputArray.map(async (assignment) => {
        const roleRecord = await db
          .selectFrom("player_roles")
          .where("id", "=", assignment.roleId)
          .select("role_name")
          .executeTakeFirst();

        return {
          _playerId: assignment.playerId,
          _roundId: assignment.roundId,
          _teamId: assignment.teamId,
          role: mapRoleNameToEnum(roleRecord?.role_name || ""),
        };
      });

      return Promise.all(assignmentPromises);
    } catch (error) {
      throw new UnexpectedRepositoryError(
        "Failed to create player role assignments",
        { cause: error },
      );
    }
  };

/**
 * Creates a function that loads the static role-name → id mapping
 * from the player_roles table.
 *
 * Returns the full set of known roles as a Record keyed by PlayerRole.
 * CODEMASTER and CODEBREAKER are required and assertion-checked;
 * SPECTATOR is loaded if present but not required.
 */
export const findRoleIdsByName =
  (db: Kysely<DB>): RoleIdsByNameFinder =>
  async () => {
    try {
      const rows = await db
        .selectFrom("player_roles")
        .select(["id", "role_name"])
        .execute();

      const map: Partial<Record<PlayerRole, number>> = {};
      for (const row of rows) {
        const role = mapRoleNameToEnum(row.role_name);
        if (role !== PLAYER_ROLE.NONE) {
          map[role] = row.id;
        }
      }

      const required: PlayerRole[] = [
        PLAYER_ROLE.CODEMASTER,
        PLAYER_ROLE.CODEBREAKER,
      ];
      const missing = required.filter((role) => map[role] === undefined);
      if (missing.length > 0) {
        throw new UnexpectedRepositoryError(
          `player_roles table is missing required roles: ${missing.join(", ")}`,
        );
      }

      return map as Record<PlayerRole, number>;
    } catch (error) {
      if (error instanceof UnexpectedRepositoryError) throw error;
      throw new UnexpectedRepositoryError("Failed to load player role IDs", {
        cause: error,
      });
    }
  };

function mapRoleNameToEnum(roleName: string): PlayerRole {
  switch (roleName.toUpperCase()) {
    case "CODEMASTER":
      return PLAYER_ROLE.CODEMASTER;
    case "CODEBREAKER":
      return PLAYER_ROLE.CODEBREAKER;
    case "SPECTATOR":
      return PLAYER_ROLE.SPECTATOR;
    default:
      return PLAYER_ROLE.NONE;
  }
}
