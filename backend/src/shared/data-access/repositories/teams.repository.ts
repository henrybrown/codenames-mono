import { Kysely } from "kysely";
import { DB } from "../../db/db.types";

/** Team primary-key id. */
export type TeamId = number;

/** Game primary-key id. */
export type GameId = number;

/** Input for creating one or more teams under a single game. */
export type TeamsInput = {
  gameId: number;
  teamNames: string[];
};

/** Service-layer projection of a teams row. */
export type TeamResult = {
  _id: number;
  _gameId: number;
  teamName: string;
};

/** Lookup-by-game signature returning all teams for a game. */
export type TeamsFinder<T extends GameId> = (
  identifier: T,
) => Promise<TeamResult[]>;

/** Signature for bulk-creating teams. */
export type TeamsCreator = (input: TeamsInput) => Promise<TeamResult[]>;

/** Signature for fetching a team-name → team-id map for a subset of teams. */
export type TeamNameMapper = (
  gameId: GameId,
  teamNames: string[],
) => Promise<Map<string, TeamId>>;

/** Lookup-by-name within a game; returns id only or null. */
export type TeamByNameFinder = (
  gameId: GameId,
  teamName: string,
) => Promise<{ _id: TeamId } | null>;

/** Builds a creator that inserts multiple team rows in one call. */
export const createTeams =
  (db: Kysely<DB>): TeamsCreator =>
  async ({ gameId, teamNames }) => {
    const values = teamNames.map((name) => ({
      game_id: gameId,
      team_name: name,
    }));

    const teams = await db
      .insertInto("teams")
      .values(values)
      .returning(["id", "game_id", "team_name"])
      .execute();

    return teams
      ? teams.map((team) => ({
          _id: team.id,
          _gameId: team.game_id,
          teamName: team.team_name,
        }))
      : [];
  };

/** Builds a finder that returns all teams for a game. */
export const getTeamsByGameId =
  (db: Kysely<DB>): TeamsFinder<GameId> =>
  async (gameId) => {
    const teams = await db
      .selectFrom("teams")
      .where("game_id", "=", gameId)
      .select(["id", "game_id", "team_name"])
      .execute();

    return teams
      ? teams.map((team) => ({
          _id: team.id,
          _gameId: team.game_id,
          teamName: team.team_name,
        }))
      : [];
  };

/** Builds a finder that returns a name → id map for the named subset of teams. */
export const getTeamNameToIdMap =
  (db: Kysely<DB>): TeamNameMapper =>
  async (gameId, teamNames) => {
    const teams = await db
      .selectFrom("teams")
      .where("game_id", "=", gameId)
      .where("team_name", "in", teamNames)
      .select(["id", "team_name"])
      .execute();

    const teamMap = new Map<string, TeamId>();
    teams.forEach((team) => {
      teamMap.set(team.team_name, team.id);
    });

    return teamMap;
  };

/** Builds a finder that looks up a team by name within a game. */
export const findTeamByName =
  (db: Kysely<DB>): TeamByNameFinder =>
  async (gameId, teamName) => {
    const team = await db
      .selectFrom("teams")
      .where("game_id", "=", gameId)
      .where("team_name", "=", teamName)
      .select(["id"])
      .executeTakeFirst();

    return team ? { _id: team.id } : null;
  };
