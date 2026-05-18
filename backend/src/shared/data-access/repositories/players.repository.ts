import { Kysely, sql } from "kysely";
import { DB } from "../../db/db.types";
import { UnexpectedRepositoryError } from "./repository.errors";
import { PLAYER_ROLE, PlayerRole } from "@codenames/shared/types";
import { randomUUID } from "crypto";
import type { DbContext, TransactionContext } from "../transaction-handler";

/** Player primary-key id. */
export type PlayerId = number;
/** Public-facing player UUID. */
export type PublicPlayerId = string;
/** User primary-key id. */
export type UserId = number;
/** Game primary-key id. */
export type GameId = number;
/** Team primary-key id. */
export type TeamId = number;
/** Round primary-key id. */
export type RoundId = number;

/**
 * Service-layer projection of a player row.
 *
 * Joined with `teams.team_name` and (when available) the latest round's
 * `player_roles.role_name`. `username` is only populated by finders that
 * join `users`.
 */
export type PlayerResult = {
  _id: number;
  publicId: string;
  _userId: number;
  _gameId: number;
  _teamId: number;
  teamName: string;
  statusId: number;
  publicName: string;
  isAi: boolean;
  role: PlayerRole;
  username?: string; // Include when user context needed
};

/** Input for a single role assignment row in `player_round_roles`. */
export type PlayerRoleInput = {
  playerId: number;
  roundId: number;
  roleId: number;
  teamId: number;
};

/** Service-layer projection of a created role-assignment row. */
export type RoleAssignmentResult = {
  _playerId: number;
  _roundId: number;
  role: PlayerRole;
};

/** Input for inserting a new player row. */
export type PlayerInput = {
  userId: number;
  gameId: number;
  publicName: string;
  teamId: number;
  statusId: number;
  isAi?: boolean;
};

/** Input for updating a single player; identified by public id + game id. */
export type ModifyPlayerInput = {
  gameId: number;
  publicPlayerId: string;
  publicName?: string;
  teamId?: number;
  userId?: number;
};

/** Lookup-many signature keyed on either game id or round id. */
export type PlayerFinderAll<T extends GameId | RoundId> = (
  identifier: T,
) => Promise<PlayerResult[]>;

/** Lookup-one signature keyed on the player's public id. */
export type PlayerFinderByPublicId = (
  publicId: PublicPlayerId,
) => Promise<PlayerResult | null>;

/** Lookup-one signature keyed on (gameId, userId). */
export type PlayerFinderByGameAndUser = (
  gameId: GameId,
  userId: UserId,
) => Promise<PlayerResult | null>;

/** Lookup signature returning all of a user's player rows in a game. */
export type PlayerContextFinder = (
  gameId: GameId,
  userId: UserId,
  roundId: RoundId | null,
) => Promise<PlayerResult[] | null>;

/** Lookup signature returning player ids that ever held a given role. */
export type RoleHistoryFinder = (
  gameId: GameId,
  role: PlayerRole,
) => Promise<number[]>;

/** Signature for inserting one or more role-assignment rows. */
export type RoleAssignmentCreator = (
  input: PlayerRoleInput | PlayerRoleInput[],
) => Promise<RoleAssignmentResult[]>;

/** Signature for bulk-inserting player rows. */
export type PlayersCreator = (
  playersData: PlayerInput[],
) => Promise<PlayerResult[]>;

/** Signature for deleting a player and returning their final row state. */
export type PlayerRemover = (playerId: PlayerId) => Promise<PlayerResult>;

/** Signature for bulk-updating players. */
export type PlayersUpdater = (
  playersData: ModifyPlayerInput[],
) => Promise<PlayerResult[]>;

const playerResultColumns = [
  "players.id as id",
  "players.public_id as public_id",
  "players.user_id as user_id",
  "players.game_id as game_id",
  "players.team_id as team_id",
  "players.status_id as status_id",
  "players.public_name as public_name",
  "players.is_ai as is_ai",
  "players.updated_at as updated_at",
  "players.status_last_changed as status_last_changed",
] as const;

/** this is a helper used to add the team name to queries */
const teamNameLookup =
  sql<string>`(SELECT team_name FROM teams WHERE teams.id = players.team_id)`.as(
    "team_name",
  );

function parseRoleName(roleName: string | null): PlayerRole {
  if (!roleName) return PLAYER_ROLE.NONE;

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

/** Builds a finder returning all players for a game, with their latest round role. */
export const findPlayersByGameId =
  (db: DbContext | TransactionContext): PlayerFinderAll<GameId> =>
  async (gameId) => {
    const players = await db
      .selectFrom("players")
      .leftJoin("users", "players.user_id", "users.id")
      .leftJoin("player_round_roles as latest_prr", (join) =>
        join
          .onRef("latest_prr.player_id", "=", "players.id")
          .on("latest_prr.round_id", "=", (eb) =>
            eb
              .selectFrom("rounds")
              .where("rounds.game_id", "=", gameId)
              .select("rounds.id")
              .orderBy("rounds.round_number", "desc")
              .limit(1),
          ),
      )
      .leftJoin("player_roles", "latest_prr.role_id", "player_roles.id")
      .where("players.game_id", "=", gameId)
      .select([
        ...playerResultColumns,
        teamNameLookup,
        "users.username",
        "player_roles.role_name",
      ])
      .execute();

    return players.map((player) => ({
      _id: player.id,
      publicId: player.public_id,
      _userId: player.user_id,
      _gameId: player.game_id,
      _teamId: player.team_id,
      teamName: player.team_name,
      statusId: player.status_id,
      publicName: player.public_name,
      isAi: player.is_ai,
      role: parseRoleName(player.role_name),
      username: player.username || undefined,
    }));
  };

/** Builds a finder returning all players who had a role in a specific round. */
export const findPlayersByRoundId =
  (db: DbContext | TransactionContext): PlayerFinderAll<RoundId> =>
  async (roundId) => {
    const players = await db
      .selectFrom("players")
      .innerJoin(
        "player_round_roles",
        "players.id",
        "player_round_roles.player_id",
      )
      .innerJoin(
        "player_roles",
        "player_round_roles.role_id",
        "player_roles.id",
      )
      .where("player_round_roles.round_id", "=", roundId)
      .select([
        ...playerResultColumns,
        teamNameLookup,
        "player_roles.role_name",
      ])
      .execute();

    return players.map((player) => ({
      _id: player.id,
      publicId: player.public_id,
      _userId: player.user_id,
      _gameId: player.game_id,
      _teamId: player.team_id,
      teamName: player.team_name,
      statusId: player.status_id,
      publicName: player.public_name,
      isAi: player.is_ai,
      role: parseRoleName(player.role_name),
    }));
  };

/** Builds a finder that looks up a single player by their public id. */
export const findPlayerByPublicId =
  (db: DbContext | TransactionContext): PlayerFinderByPublicId =>
  async (publicId) => {
    const player = await db
      .selectFrom("players")
      .innerJoin("teams", "players.team_id", "teams.id")
      .leftJoin("player_round_roles as latest_prr", (join) =>
        join
          .onRef("latest_prr.player_id", "=", "players.id")
          .on("latest_prr.round_id", "=", (eb) =>
            eb
              .selectFrom("rounds")
              .where("rounds.game_id", "=", eb.ref("players.game_id"))
              .select("rounds.id")
              .orderBy("rounds.round_number", "desc")
              .limit(1),
          ),
      )
      .leftJoin("player_roles", "latest_prr.role_id", "player_roles.id")
      .where("players.public_id", "=", publicId)
      .select([
        ...playerResultColumns,
        "teams.team_name",
        "player_roles.role_name",
      ])
      .executeTakeFirst();

    return player
      ? {
          _id: player.id,
          publicId: player.public_id,
          _userId: player.user_id,
          _gameId: player.game_id,
          _teamId: player.team_id,
          teamName: player.team_name,
          statusId: player.status_id,
          publicName: player.public_name,
          isAi: player.is_ai,
          role: parseRoleName(player.role_name),
        }
      : null;
  };

/**
 * Find a single player by (game ID, user ID).
 *
 * For multi-device games, a user has at most one player per game; this
 * returns it (with their latest round role) or null.
 *
 * For single-device games, a user (typically the lobby creator) may own
 * multiple players in the same game. This function returns one of them
 * (which one is non-deterministic). Single-device callers should not rely
 * on this function — use findPlayersByGameId or work from the aggregate.
 */
export const findPlayerByGameAndUser =
  (db: DbContext | TransactionContext): PlayerFinderByGameAndUser =>
  async (gameId, userId) => {
    const player = await db
      .selectFrom("players")
      .innerJoin("teams", "players.team_id", "teams.id")
      .leftJoin("player_round_roles as latest_prr", (join) =>
        join
          .onRef("latest_prr.player_id", "=", "players.id")
          .on("latest_prr.round_id", "=", (eb) =>
            eb
              .selectFrom("rounds")
              .where("rounds.game_id", "=", gameId)
              .select("rounds.id")
              .orderBy("rounds.round_number", "desc")
              .limit(1),
          ),
      )
      .leftJoin("player_roles", "latest_prr.role_id", "player_roles.id")
      .where("players.game_id", "=", gameId)
      .where("players.user_id", "=", userId)
      .select([
        ...playerResultColumns,
        "teams.team_name",
        "player_roles.role_name",
      ])
      .executeTakeFirst();
    return player
      ? {
          _id: player.id,
          publicId: player.public_id,
          _userId: player.user_id,
          _gameId: player.game_id,
          _teamId: player.team_id,
          teamName: player.team_name,
          statusId: player.status_id,
          publicName: player.public_name,
          isAi: player.is_ai,
          role: parseRoleName(player.role_name),
        }
      : null;
  };

/**
 * Builds a finder returning all of a user's player rows in a game.
 *
 * Joins against a specific `roundId` (when provided) to scope role data;
 * returns `null` if the user has no players in the game.
 */
export const getPlayerContext =
  (db: DbContext | TransactionContext): PlayerContextFinder =>
  async (gameId, userId, roundId) => {
    const players = await db
      .selectFrom("players")
      .innerJoin("users", "players.user_id", "users.id")
      .innerJoin("teams", "players.team_id", "teams.id")
      .leftJoin("player_round_roles", (join) =>
        join
          .onRef("player_round_roles.player_id", "=", "players.id")
          .on("player_round_roles.round_id", "=", roundId),
      )
      .leftJoin("player_roles", "player_round_roles.role_id", "player_roles.id")
      .where("players.game_id", "=", gameId)
      .where("players.user_id", "=", userId)
      .select([
        ...playerResultColumns,
        teamNameLookup,
        "users.username",
        "player_roles.role_name",
      ])
      .execute();

    if (!players || players.length === 0) return null;

    return players.map((player) => ({
      _id: player.id,
      publicId: player.public_id,
      _userId: player.user_id,
      _gameId: player.game_id,
      _teamId: player.team_id,
      teamName: player.team_name,
      statusId: player.status_id,
      publicName: player.public_name,
      isAi: player.is_ai,
      username: player.username,
      role: player.role_name
        ? parseRoleName(player.role_name)
        : PLAYER_ROLE.NONE,
    }));
  };

/**
 * Builds a finder returning the deduplicated set of player ids that have
 * ever held a given role across any round of the game.
 *
 * Used to bias future role assignments away from players who've already
 * had a turn at that role.
 */
export const getRoleHistory =
  (db: DbContext | TransactionContext): RoleHistoryFinder =>
  async (gameId, role) => {
    const history = await db
      .selectFrom("player_round_roles")
      .innerJoin("rounds", "player_round_roles.round_id", "rounds.id")
      .innerJoin(
        "player_roles",
        "player_round_roles.role_id",
        "player_roles.id",
      )
      .where("rounds.game_id", "=", gameId)
      .where("player_roles.role_name", "=", role)
      .select("player_round_roles.player_id")
      .execute();

    return [...new Set(history.map((r) => r.player_id))];
  };

/**
 * Builds a creator that inserts one or more role-assignment rows.
 *
 * Accepts a single input or an array. After insert, fetches the team id
 * for each player so the returned result is fully populated.
 */
export const assignPlayerRoles =
  (db: DbContext | TransactionContext): RoleAssignmentCreator =>
  async (input) => {
    const inputArray = Array.isArray(input) ? input : [input];
    if (inputArray.length === 0) return [];

    const values = inputArray.map((assignment) => ({
      player_id: assignment.playerId,
      round_id: assignment.roundId,
      role_id: assignment.roleId,
      assigned_at: new Date(),
    }));

    const insertResult = await db
      .insertInto("player_round_roles")
      .values(values)
      .returningAll()
      .execute();

    const playerResults = await Promise.all(
      insertResult.map(async (assignment) => {
        const playerData = await db
          .selectFrom("players")
          .where("id", "=", assignment.player_id)
          .select("team_id")
          .executeTakeFirst();

        return {
          _playerId: assignment.player_id,
          _roundId: assignment.round_id,
          _teamId: playerData?.team_id || 0,
          role:
            assignment.role_id === 1
              ? PLAYER_ROLE.CODEMASTER
              : PLAYER_ROLE.CODEBREAKER,
        };
      }),
    );

    return playerResults;
  };

/** Builds a creator that bulk-inserts player rows. Each gets a fresh UUID public id. */
export const addPlayers =
  (db: DbContext | TransactionContext): PlayersCreator =>
  async (playersData) => {
    if (playersData.length === 0) return [];

    const values = playersData.map((player) => ({
      public_id: randomUUID(),
      user_id: player.userId,
      game_id: player.gameId,
      public_name: player.publicName,
      team_id: player.teamId,
      status_id: player.statusId,
      is_ai: player.isAi ?? false,
      updated_at: new Date(),
    }));

    const newPlayers = await db
      .insertInto("players")
      .values(values)
      .returning([...playerResultColumns, teamNameLookup])
      .execute();

    return newPlayers.map((player) => ({
      _id: player.id,
      publicId: player.public_id,
      _userId: player.user_id,
      _gameId: player.game_id,
      _teamId: player.team_id,
      teamName: player.team_name,
      statusId: player.status_id,
      publicName: player.public_name,
      isAi: player.is_ai,
      role: PLAYER_ROLE.NONE,
    }));
  };

/** Builds a remover that deletes a player and returns their final row state. */
export const removePlayer =
  (db: DbContext | TransactionContext): PlayerRemover =>
  async (playerId) => {
    const removedPlayer = await db
      .deleteFrom("players")
      .where("players.id", "=", playerId)
      .returning([...playerResultColumns, teamNameLookup])
      .executeTakeFirstOrThrow();

    return {
      _id: removedPlayer.id,
      publicId: removedPlayer.public_id,
      _userId: removedPlayer.user_id,
      _gameId: removedPlayer.game_id,
      _teamId: removedPlayer.team_id,
      teamName: removedPlayer.team_name,
      statusId: removedPlayer.status_id,
      publicName: removedPlayer.public_name,
      isAi: removedPlayer.is_ai,
      role: PLAYER_ROLE.NONE,
    };
  };

/**
 * Builds an updater that applies partial updates to a set of players.
 *
 * Only fields with defined values are written; rows with no provided
 * updates are skipped. Returns the post-update row set for all targeted
 * players (whether changed or not).
 */
export const modifyPlayers =
  (db: DbContext | TransactionContext): PlayersUpdater =>
  async (playersData) => {
    if (!playersData.length) return [];

    const playersWithUpdates = playersData.filter(
      (player) =>
        player.publicName !== undefined ||
        player.teamId !== undefined ||
        player.userId !== undefined,
    );

    if (playersWithUpdates.length === 0) return [];

    await Promise.all(
      playersWithUpdates.map(async (player) => {
        const updateValues = Object.fromEntries(
          Object.entries({
            user_id: player.userId,
            public_name: player.publicName,
            team_id: player.teamId,
            updated_at: new Date(),
          }).filter(([_, value]) => value !== undefined),
        );

        await db
          .updateTable("players")
          .set(updateValues)
          .where("players.public_id", "=", player.publicPlayerId)
          .where("players.game_id", "=", player.gameId)
          .executeTakeFirst();
      }),
    );

    const allPublicPlayerIds = playersData.map(
      (player) => player.publicPlayerId,
    );

    const updatedPlayers = await db
      .selectFrom("players")
      .innerJoin("teams", "players.team_id", "teams.id")
      .leftJoin("player_round_roles as latest_prr", (join) =>
        join
          .onRef("latest_prr.player_id", "=", "players.id")
          .on("latest_prr.round_id", "=", (eb) =>
            eb
              .selectFrom("rounds")
              .where("rounds.game_id", "=", eb.ref("players.game_id"))
              .select("rounds.id")
              .orderBy("rounds.round_number", "desc")
              .limit(1),
          ),
      )
      .leftJoin("player_roles", "latest_prr.role_id", "player_roles.id")
      .where("players.public_id", "in", allPublicPlayerIds)
      .select([
        ...playerResultColumns,
        "teams.team_name",
        "player_roles.role_name",
      ])
      .execute();

    return updatedPlayers.map((player) => ({
      _id: player.id,
      publicId: player.public_id,
      _userId: player.user_id,
      _gameId: player.game_id,
      _teamId: player.team_id,
      teamName: player.team_name,
      statusId: player.status_id,
      publicName: player.public_name,
      isAi: player.is_ai,
      role: parseRoleName(player.role_name),
    }));
  };
