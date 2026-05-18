import type { AIPlayerService } from "@backend/ai/player";
import type { GameAggregateLoader } from "@backend/game/state/load-game-aggregate";
import { findPlayerByUserId } from "@backend/game/access";
import type { AppLogger } from "@backend/shared/logging";

/**
 * Run handle returned on a successful trigger.
 *
 * `runId` may be the literal string `"pending"` when the move was kicked off
 * asynchronously and the actual run id isn't yet known — clients should treat
 * that as "watch the status endpoint" rather than as a real identifier.
 */
export interface PipelineRunInfo {
  runId: string;
  pipelineType: "SPYMASTER" | "GUESSER";
  startedAt: string;
}

/** Wiring dependencies for the trigger-move service. */
export interface TriggerMoveServiceDeps {
  aiPlayerService: AIPlayerService;
  loadGameAggregate: GameAggregateLoader;
}

/**
 * Tagged result for a trigger-move attempt.
 *
 * `not-ai-turn` and `already-running` are both 409-class conflicts; the
 * other failure tags map to 404/403. Internal errors are thrown, not
 * returned, so a `status: "success"` result is the only success path.
 */
export type TriggerMoveResult =
  | { status: "success"; run: PipelineRunInfo }
  | { status: "game-not-found"; gameId: string }
  | { status: "unauthorized"; gameId: string; userId: number }
  | { status: "not-ai-turn"; gameId: string }
  | { status: "already-running"; gameId: string };

/**
 * Builds the trigger-move service.
 *
 * Validates game existence + user membership, then asks the AI player to
 * act if it's its turn. The actual pipeline runs asynchronously, so the
 * service returns a `"pending"` placeholder run and clients are expected
 * to follow up via the status endpoint or WebSocket events.
 */
export const triggerMoveService =
  (logger: AppLogger) =>
  (deps: TriggerMoveServiceDeps) =>
  async (gameId: string, userId: number): Promise<TriggerMoveResult> => {
    const aggregate = await deps.loadGameAggregate(gameId);
    if (!aggregate) {
      return { status: "game-not-found", gameId };
    }

    if (!findPlayerByUserId(aggregate, userId)) {
      return { status: "unauthorized", gameId, userId };
    }

    try {
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

/** Service-call signature for triggering an AI move. */
export type TriggerMoveService = ReturnType<ReturnType<typeof triggerMoveService>>;
