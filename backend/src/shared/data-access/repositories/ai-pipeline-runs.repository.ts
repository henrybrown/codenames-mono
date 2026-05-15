import { Kysely } from "kysely";
import { DB } from "../../db/db.types";
import { z } from "zod";
import { UnexpectedRepositoryError } from "./repository.errors";

export type RunId = string;
export type GameId = number;
export type PlayerId = number;

export const PIPELINE_TYPE = {
  SPYMASTER: "SPYMASTER",
  GUESSER: "GUESSER",
} as const;

export type PipelineType = (typeof PIPELINE_TYPE)[keyof typeof PIPELINE_TYPE];

export const PIPELINE_STATUS = {
  RUNNING: "RUNNING",
  COMPLETE: "COMPLETE",
  FAILED: "FAILED",
} as const;

export type PipelineStatus =
  (typeof PIPELINE_STATUS)[keyof typeof PIPELINE_STATUS];

export interface SpymasterResponse {
  clue: {
    word: string;
    targetCardCount: number;
  };
  reasoning?: string;
}

export interface PrefilterResponse {
  candidateWords: string[];
  reasoning?: string;
}

export interface RankerResponse {
  rankedWords: Array<{
    word: string;
    score: number;
    reasoning?: string;
  }>;
}

export type PipelineRunData = {
  id: string;
  game_id: number;
  player_id: number;
  pipeline_type: PipelineType;
  status: PipelineStatus;
  error: string | null;
  spymaster_response: SpymasterResponse | null;
  prefilter_response: PrefilterResponse | null;
  ranker_response: RankerResponse | null;
  started_at: Date;
  completed_at: Date | null;
};

export type CreatePipelineRunInput = {
  gameId: number;
  playerId: number;
  pipelineType: PipelineType;
};

export type RunFinder = (runId: RunId) => Promise<PipelineRunData | null>;
export type RunFinderByGame = (gameId: GameId) => Promise<PipelineRunData | null>;
export type RunCreator = (input: CreatePipelineRunInput) => Promise<PipelineRunData>;
export type RunStatusUpdater = (
  runId: RunId,
  status: PipelineStatus,
  error?: string,
) => Promise<void>;
export type RunResponseUpdater = <T extends keyof Pick<PipelineRunData, 'spymaster_response' | 'prefilter_response' | 'ranker_response'>>(
  runId: RunId,
  stage: T,
  response: PipelineRunData[T],
) => Promise<void>;
export type PromptAppender = (runId: RunId, newPrompt: string) => Promise<void>;

export const pipelineTypeSchema = z.enum([
  PIPELINE_TYPE.SPYMASTER,
  PIPELINE_TYPE.GUESSER,
]);

export const pipelineStatusSchema = z.enum([
  PIPELINE_STATUS.RUNNING,
  PIPELINE_STATUS.COMPLETE,
  PIPELINE_STATUS.FAILED,
]);

export const findRunById =
  (db: Kysely<DB>): RunFinder =>
  async (runId) => {
    const run = await db
      .selectFrom("ai_pipeline_runs")
      .selectAll()
      .where("id", "=", runId)
      .executeTakeFirst();

    return run
      ? {
          id: run.id,
          game_id: run.game_id,
          player_id: run.player_id,
          pipeline_type: pipelineTypeSchema.parse(run.pipeline_type),
          status: pipelineStatusSchema.parse(run.status),
          error: run.error,
          spymaster_response: run.spymaster_response as SpymasterResponse | null,
          prefilter_response: run.prefilter_response as PrefilterResponse | null,
          ranker_response: run.ranker_response as RankerResponse | null,
          started_at: run.started_at,
          completed_at: run.completed_at,
        }
      : null;
  };

export const findRunningByGameId =
  (db: Kysely<DB>): RunFinderByGame =>
  async (gameId) => {
    const run = await db
      .selectFrom("ai_pipeline_runs")
      .selectAll()
      .where("game_id", "=", gameId)
      .where("status", "=", PIPELINE_STATUS.RUNNING)
      .orderBy("started_at", "desc")
      .executeTakeFirst();

    return run
      ? {
          id: run.id,
          game_id: run.game_id,
          player_id: run.player_id,
          pipeline_type: pipelineTypeSchema.parse(run.pipeline_type),
          status: pipelineStatusSchema.parse(run.status),
          error: run.error,
          spymaster_response: run.spymaster_response as SpymasterResponse | null,
          prefilter_response: run.prefilter_response as PrefilterResponse | null,
          ranker_response: run.ranker_response as RankerResponse | null,
          started_at: run.started_at,
          completed_at: run.completed_at,
        }
      : null;
  };

export const createRun =
  (db: Kysely<DB>): RunCreator =>
  async (input) => {
    try {
      const run = await db
        .insertInto("ai_pipeline_runs")
        .values({
          game_id: input.gameId,
          player_id: input.playerId,
          pipeline_type: input.pipelineType,
          status: PIPELINE_STATUS.RUNNING,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return {
        id: run.id,
        game_id: run.game_id,
        player_id: run.player_id,
        pipeline_type: pipelineTypeSchema.parse(run.pipeline_type),
        status: pipelineStatusSchema.parse(run.status),
        error: run.error,
        spymaster_response: run.spymaster_response as SpymasterResponse | null,
        prefilter_response: run.prefilter_response as PrefilterResponse | null,
        ranker_response: run.ranker_response as RankerResponse | null,
        started_at: run.started_at,
        completed_at: run.completed_at,
      };
    } catch (error) {
      throw new UnexpectedRepositoryError(
        `Failed to create pipeline run for game ${input.gameId}`,
        { cause: error },
      );
    }
  };

export const updateRunStatus =
  (db: Kysely<DB>): RunStatusUpdater =>
  async (runId, status, error) => {
    try {
      const updates: {
        status: PipelineStatus;
        completed_at?: Date;
        error?: string | null;
      } = { status };

      if (status === PIPELINE_STATUS.COMPLETE || status === PIPELINE_STATUS.FAILED) {
        updates.completed_at = new Date();
      }

      if (error !== undefined) {
        updates.error = error;
      }

      await db
        .updateTable("ai_pipeline_runs")
        .set(updates)
        .where("id", "=", runId)
        .executeTakeFirstOrThrow();
    } catch (error) {
      throw new UnexpectedRepositoryError(
        `Failed to update pipeline run ${runId} status to ${status}`,
        { cause: error },
      );
    }
  };

export const updateSpymasterResponse =
  (db: Kysely<DB>) =>
  async (runId: RunId, response: SpymasterResponse): Promise<void> => {
    try {
      await db
        .updateTable("ai_pipeline_runs")
        .set({ spymaster_response: JSON.stringify(response) })
        .where("id", "=", runId)
        .executeTakeFirstOrThrow();
    } catch (error) {
      throw new UnexpectedRepositoryError(
        `Failed to update spymaster response for run ${runId}`,
        { cause: error },
      );
    }
  };

export const updatePrefilterResponse =
  (db: Kysely<DB>) =>
  async (runId: RunId, response: PrefilterResponse): Promise<void> => {
    try {
      await db
        .updateTable("ai_pipeline_runs")
        .set({ prefilter_response: JSON.stringify(response) })
        .where("id", "=", runId)
        .executeTakeFirstOrThrow();
    } catch (error) {
      throw new UnexpectedRepositoryError(
        `Failed to update prefilter response for run ${runId}`,
        { cause: error },
      );
    }
  };

export const updateRankerResponse =
  (db: Kysely<DB>) =>
  async (runId: RunId, response: RankerResponse): Promise<void> => {
    try {
      await db
        .updateTable("ai_pipeline_runs")
        .set({ ranker_response: JSON.stringify(response) })
        .where("id", "=", runId)
        .executeTakeFirstOrThrow();
    } catch (error) {
      throw new UnexpectedRepositoryError(
        `Failed to update ranker response for run ${runId}`,
        { cause: error },
      );
    }
  };

export const appendPrompt =
  (db: Kysely<DB>): PromptAppender =>
  async (runId, newPrompt) => {
    try {
      const current = await db
        .selectFrom("ai_pipeline_runs")
        .select("prompt")
        .where("id", "=", runId)
        .executeTakeFirst();

      const existingPrompt = current?.prompt || "";
      const updatedPrompt = existingPrompt
        ? `${existingPrompt}\n\n--- NEXT PROMPT ---\n\n${newPrompt}`
        : newPrompt;

      await db
        .updateTable("ai_pipeline_runs")
        .set({ prompt: updatedPrompt })
        .where("id", "=", runId)
        .executeTakeFirstOrThrow();
    } catch (error) {
      throw new UnexpectedRepositoryError(
        `Failed to append prompt for run ${runId}`,
        { cause: error },
      );
    }
  };
