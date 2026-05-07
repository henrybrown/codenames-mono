import type { AIPlayerService } from "@backend/ai/player";
import type { GameplayStateProvider } from "@backend/game/gameplay/state/gameplay-state.provider";
import type { AppLogger } from "@backend/shared/logging";

/**
 * Pipeline run info
 */
export interface PipelineRunInfo {
  runId: string;
  pipelineType: "SPYMASTER" | "GUESSER";
  startedAt: string;
}

/**
 * Dependencies required by the service
 */
export interface TriggerMoveServiceDeps {
  aiPlayerService: AIPlayerService;
  getGameState: GameplayStateProvider;
}

/**
 * Service result types
 */
export type TriggerMoveResult =
  | { status: "success"; run: PipelineRunInfo }
  | { status: "game-not-found"; gameId: string }
  | { status: "unauthorized"; gameId: string; userId: number }
  | { status: "not-ai-turn"; gameId: string }
  | { status: "already-running"; gameId: string };

/**
 * Creates the trigger move service
 *
 * This service manually triggers an AI move by calling checkAndActIfNeeded
 * on the AI player service, which will determine if AI should act and execute
 * the appropriate pipeline.
 */
export const triggerMoveService =
  (logger: AppLogger) =>
  (deps: TriggerMoveServiceDeps) =>
  async (gameId: string, userId: number): Promise<TriggerMoveResult> => {
    // Verify user has access to this game
    const gameState = await deps.getGameState(gameId, userId);

    if (gameState.status === "game-not-found") {
      return { status: "game-not-found", gameId };
    }

    if (gameState.status !== "found") {
      return { status: "unauthorized", gameId, userId };
    }

    try {
      // Trigger the AI service to check and act if needed
      // This will create a pipeline run and execute it asynchronously
      await deps.aiPlayerService.checkAndActIfNeeded(gameId);

      // The AI service handles pipeline creation internally, so we return
      // a pending status. Clients should poll the status endpoint or
      // listen to WebSocket events to track progress.
      return {
        status: "success",
        run: {
          runId: "pending",
          pipelineType: "SPYMASTER",
          startedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      logger.error("triggerMove failed", { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  };

export type TriggerMoveService = ReturnType<ReturnType<typeof triggerMoveService>>;
