import type { RunFinderByGame } from "@backend/shared/data-access/repositories/ai-pipeline-runs.repository";
import type { GameAggregateLoader } from "@backend/game/state/load-game-aggregate";
import { findPlayerByUserId } from "@backend/game/access";

export type HealthPlacement = "gpu" | "partial" | "cpu" | "not-loaded" | "unknown";

export interface AiHealth {
  placement: HealthPlacement;
  gpuPercent: number;
}

export interface AiStatus {
  available: boolean; // Is it AI's turn and can trigger?
  thinking: boolean; // Is pipeline currently running?
  runId?: string; // Current run ID if thinking
  /** Inference engine health. Present when using a local provider (Ollama). */
  health?: AiHealth;
}

/**
 * Narrow interface for the LLM dependency — only the methods we need here.
 */
export interface HealthAwareLLM {
  probeHealth: () => Promise<void>;
  getHealthState: () => {
    placement: HealthPlacement;
    gpuPercent: number;
  } | undefined;
}

export interface GetStatusServiceDeps {
  findRunningPipeline: RunFinderByGame;
  loadGameAggregate: GameAggregateLoader;
  llm: HealthAwareLLM;
}

export type GetStatusResult =
  | { status: "success"; aiStatus: AiStatus }
  | { status: "game-not-found"; gameId: string }
  | { status: "unauthorized"; gameId: string; userId: number };

export const getStatusService = (deps: GetStatusServiceDeps) =>
  async (gameId: string, userId: number): Promise<GetStatusResult> => {
    // Fire-and-forget health probe. Throttled internally; failures are logged at debug.
    deps.llm.probeHealth().catch(() => { /* swallow — already logged at debug */ });

    const aggregate = await deps.loadGameAggregate(gameId);
    if (!aggregate) {
      return { status: "game-not-found", gameId };
    }

    if (!findPlayerByUserId(aggregate, userId)) {
      return { status: "unauthorized", gameId, userId };
    }

    const rawHealth = deps.llm.getHealthState();
    const health: AiHealth | undefined =
      rawHealth && rawHealth.placement !== "unknown"
        ? { placement: rawHealth.placement, gpuPercent: rawHealth.gpuPercent }
        : undefined;

    const runningPipeline = await deps.findRunningPipeline(aggregate._id);

    if (runningPipeline) {
      return {
        status: "success",
        aiStatus: {
          available: false,
          thinking: true,
          runId: runningPipeline.id,
          health,
        },
      };
    }

    if (!aggregate.currentRound) {
      return {
        status: "success",
        aiStatus: {
          available: false,
          thinking: false,
          health,
        },
      };
    }

    const currentRound = aggregate.currentRound;
    const allPlayers = aggregate.teams.flatMap((team) => team.players);
    const currentTurn = currentRound.turns.length > 0
      ? currentRound.turns[currentRound.turns.length - 1]
      : null;

    if (!currentTurn) {
      return {
        status: "success",
        aiStatus: {
          available: false,
          thinking: false,
          health,
        },
      };
    }

    let aiCanAct = false;

    if (!currentTurn.clue) {
      const aiCodemaster = allPlayers.find(
        (p) => p.teamName === currentTurn.teamName && p.isAi && p.role === "CODEMASTER"
      );
      aiCanAct = !!aiCodemaster;
    } else if (currentTurn.guessesRemaining > 0) {
      const teamCodebreakers = allPlayers.filter(
        (p) => p.teamName === currentTurn.teamName && p.role === "CODEBREAKER"
      );
      const allCodebreakersAreAI = teamCodebreakers.length > 0 && teamCodebreakers.every((p) => p.isAi);
      aiCanAct = allCodebreakersAreAI;
    }

    return {
      status: "success",
      aiStatus: {
        available: aiCanAct,
        thinking: false,
        health,
      },
    };
  };
