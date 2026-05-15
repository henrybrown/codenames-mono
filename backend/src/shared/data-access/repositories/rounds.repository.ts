import { Kysely } from "kysely";
import { DB } from "../../db/db.types";
import { ROUND_STATE, RoundState } from "@codenames/shared/types";
import { z } from "zod";
import { UnexpectedRepositoryError } from "./repository.errors";

export type RoundId = number;

export type GameId = number;

export type TeamId = number;

export type RoundInput = {
  gameId: number;
  roundNumber: number;
};

export type RoundStatusUpdateInput = {
  roundId: number;
  status: RoundState;
};

export type RoundWinnerUpdateInput = {
  roundId: number;
  winningTeamId: TeamId | null;
};

export type RoundResult = {
  _id: number;
  _gameId: number;
  _winningTeamId: TeamId | null;
  winningTeamName: string | null;
  roundNumber: number;
  status: RoundState;
  createdAt: Date;
};

export type RoundFinderAll<T extends GameId> = (
  identifier: T,
) => Promise<RoundResult[]>;

export type RoundFinder<T extends RoundId | GameId> = (
  identifier: T,
) => Promise<RoundResult | null>;

export type RoundCreator = ({
  gameId,
  roundNumber,
}: RoundInput) => Promise<RoundResult>;

export type RoundStatusUpdater = ({
  roundId,
  status,
}: RoundStatusUpdateInput) => Promise<RoundResult>;

export type RoundWinnerUpdater = ({
  roundId,
  winningTeamId,
}: RoundWinnerUpdateInput) => Promise<RoundResult>;

export const roundStatusSchema = z.enum([
  ROUND_STATE.SETUP,
  ROUND_STATE.IN_PROGRESS,
  ROUND_STATE.COMPLETED,
]);

export const getRoundsByGameId =
  (db: Kysely<DB>): RoundFinderAll<GameId> =>
  async (gameId) => {
    const rounds = await db
      .selectFrom("rounds")
      .innerJoin("round_status", "rounds.status_id", "round_status.id")
      .leftJoin("teams", "rounds.winning_team_id", "teams.id")
      .where("rounds.game_id", "=", gameId)
      .select([
        "rounds.id",
        "rounds.game_id",
        "rounds.round_number",
        "rounds.winning_team_id",
        "teams.team_name as winning_team_name",
        "round_status.status_name",
        "rounds.created_at",
      ])
      .orderBy("rounds.round_number", "asc")
      .execute();

    return rounds.map((round) => ({
      _id: round.id,
      _gameId: round.game_id,
      _winningTeamId: round.winning_team_id,
      winningTeamName: round.winning_team_name,
      roundNumber: round.round_number,
      status: roundStatusSchema.parse(round.status_name),
      createdAt: round.created_at,
    }));
  };

export const getRoundById =
  (db: Kysely<DB>): RoundFinder<RoundId> =>
  async (roundId) => {
    const round = await db
      .selectFrom("rounds")
      .innerJoin("round_status", "rounds.status_id", "round_status.id")
      .leftJoin("teams", "rounds.winning_team_id", "teams.id")
      .where("rounds.id", "=", roundId)
      .select([
        "rounds.id",
        "rounds.game_id as gameId",
        "rounds.round_number as roundNumber",
        "rounds.winning_team_id as winningTeamId",
        "teams.team_name as winningTeamName",
        "round_status.status_name as status",
        "rounds.created_at as createdAt",
      ])
      .executeTakeFirst();

    return round
      ? {
          _id: round.id,
          _gameId: round.gameId,
          _winningTeamId: round.winningTeamId,
          winningTeamName: round.winningTeamName,
          roundNumber: round.roundNumber,
          status: roundStatusSchema.parse(round.status),
          createdAt: round.createdAt,
        }
      : null;
  };

export const getLatestRound =
  (db: Kysely<DB>): RoundFinder<GameId> =>
  async (gameId) => {
    const round = await db
      .selectFrom("rounds")
      .innerJoin("round_status", "rounds.status_id", "round_status.id")
      .leftJoin("teams", "rounds.winning_team_id", "teams.id")
      .where("rounds.game_id", "=", gameId)
      .select([
        "rounds.id",
        "rounds.game_id as gameId",
        "rounds.round_number as roundNumber",
        "rounds.winning_team_id as winningTeamId",
        "teams.team_name as winningTeamName",
        "round_status.status_name as status",
        "rounds.created_at as createdAt",
      ])
      .orderBy("rounds.round_number", "desc")
      .limit(1)
      .executeTakeFirst();

    return round
      ? {
          _id: round.id,
          _gameId: round.gameId,
          _winningTeamId: round.winningTeamId,
          winningTeamName: round.winningTeamName,
          roundNumber: round.roundNumber,
          status: roundStatusSchema.parse(round.status),
          createdAt: round.createdAt,
        }
      : null;
  };

export const createNewRound =
  (db: Kysely<DB>): RoundCreator =>
  async ({ gameId, roundNumber }) => {
    try {
      const statusResult = await db
        .selectFrom("round_status")
        .where("status_name", "=", ROUND_STATE.SETUP)
        .select(["id"])
        .executeTakeFirst();

      if (!statusResult) {
        throw new UnexpectedRepositoryError(
          `Round status '${ROUND_STATE.SETUP}' not found in database`,
        );
      }

      const result = await db
        .insertInto("rounds")
        .values({
          game_id: gameId,
          round_number: roundNumber,
          status_id: statusResult.id,
          winning_team_id: null,
          created_at: new Date(),
        })
        .returning([
          "id",
          "game_id",
          "round_number",
          "winning_team_id",
          "created_at",
        ])
        .executeTakeFirstOrThrow();

      return {
        _id: result.id,
        _gameId: result.game_id,
        _winningTeamId: result.winning_team_id,
        winningTeamName: null,
        roundNumber: result.round_number,
        status: ROUND_STATE.SETUP,
        createdAt: result.created_at,
      };
    } catch (error) {
      if (error instanceof UnexpectedRepositoryError) {
        throw error;
      }
      throw new UnexpectedRepositoryError(
        `Failed to create round for game ${gameId}`,
        { cause: error },
      );
    }
  };

export const updateRoundStatus =
  (db: Kysely<DB>): RoundStatusUpdater =>
  async ({ roundId, status }) => {
    try {
      const statusResult = await db
        .selectFrom("round_status")
        .where("status_name", "=", status)
        .select(["id"])
        .executeTakeFirst();

      if (!statusResult) {
        throw new UnexpectedRepositoryError(
          `Round status '${status}' not found in database`,
        );
      }

      const updatedRound = await db
        .updateTable("rounds")
        .set({
          status_id: statusResult.id,
          updated_at: new Date(),
        })
        .where("id", "=", roundId)
        .returning([
          "id",
          "game_id as gameId",
          "round_number as roundNumber",
          "winning_team_id as winningTeamId",
          "created_at as createdAt",
        ])
        .executeTakeFirstOrThrow();

      let winningTeamName = null;
      if (updatedRound.winningTeamId) {
        const team = await db
          .selectFrom("teams")
          .where("id", "=", updatedRound.winningTeamId)
          .select(["team_name"])
          .executeTakeFirst();

        winningTeamName = team ? team.team_name : null;
      }

      return {
        _id: updatedRound.id,
        _gameId: updatedRound.gameId,
        _winningTeamId: updatedRound.winningTeamId,
        winningTeamName,
        roundNumber: updatedRound.roundNumber,
        status: status,
        createdAt: updatedRound.createdAt,
      };
    } catch (error) {
      if (error instanceof UnexpectedRepositoryError) {
        throw error;
      }
      throw new UnexpectedRepositoryError(
        `Failed to update status for round ${roundId}`,
        { cause: error },
      );
    }
  };

export const updateRoundWinner =
  (db: Kysely<DB>): RoundWinnerUpdater =>
  async ({ roundId, winningTeamId }) => {
    try {
      let winningTeamName = null;
      if (winningTeamId) {
        const team = await db
          .selectFrom("teams")
          .where("id", "=", winningTeamId)
          .select(["team_name"])
          .executeTakeFirst();

        winningTeamName = team ? team.team_name : null;
      }

      const updatedRound = await db
        .updateTable("rounds")
        .set({
          winning_team_id: winningTeamId,
          updated_at: new Date(),
        })
        .where("id", "=", roundId)
        .returning([
          "id",
          "game_id as gameId",
          "round_number as roundNumber",
          "winning_team_id as winningTeamId",
          "created_at as createdAt",
        ])
        .executeTakeFirstOrThrow();

      const roundStatus = await db
        .selectFrom("rounds")
        .innerJoin("round_status", "rounds.status_id", "round_status.id")
        .where("rounds.id", "=", roundId)
        .select(["round_status.status_name as status"])
        .executeTakeFirstOrThrow();

      return {
        _id: updatedRound.id,
        _gameId: updatedRound.gameId,
        roundNumber: updatedRound.roundNumber,
        status: roundStatusSchema.parse(roundStatus.status),
        _winningTeamId: updatedRound.winningTeamId,
        winningTeamName,
        createdAt: updatedRound.createdAt,
      };
    } catch (error) {
      throw new UnexpectedRepositoryError(
        `Failed to update winner for round ${roundId}`,
        { cause: error },
      );
    }
  };
