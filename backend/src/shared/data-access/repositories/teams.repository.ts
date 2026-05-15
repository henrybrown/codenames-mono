import { Kysely } from "kysely";
import { DB } from "../../db/db.types";

export type TeamId = number;

export type GameId = number;

export type TeamsInput = {
  gameId: number;
  teamNames: string[];
};

export type TeamResult = {
  _id: number;
  _gameId: number;
  teamName: string;
};

export type TeamsFinder<T extends GameId> = (
  identifier: T,
) => Promise<TeamResult[]>;

export type TeamsCreator = (input: TeamsInput) => Promise<TeamResult[]>;

export type TeamNameMapper = (
  gameId: GameId,
  teamNames: string[],
) => Promise<Map<string, TeamId>>;

export type TeamByNameFinder = (
  gameId: GameId,
  teamName: string,
) => Promise<{ _id: TeamId } | null>;

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
