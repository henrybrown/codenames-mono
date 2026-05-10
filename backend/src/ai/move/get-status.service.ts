import type { RunFinderByGame } from "@backend/shared/data-access/repositories/ai-pipeline-runs.repository";
import type { GameplayStateProvider } from "@backend/game/gameplay/state/get-gameplay-state";
import type { GameFinder } from "@backend/shared/data-access/repositories/games.repository";

export type HealthPlacement = "gpu" | "partial" | "cpu" | "not-loaded" | "unknown";

export interface AiHealth {
  placement: HealthPlacement;
  gpuPercent: number;
}

/**
 * AI status response
 */
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

/**
 * Dependencies required by the service
 */
export interface GetStatusServiceDeps {
  findRunningPipeline: RunFinderByGame;
  findGameByPublicId: GameFinder<string>;
  getGameplayState: GameplayStateProvider;
  llm: HealthAwareLLM;
}

/**
 * Service result types
 */
export type GetStatusResult =
  | { status: "success"; aiStatus: AiStatus }
  | { status: "game-not-found"; gameId: string }
  | { status: "unauthorized"; gameId: string; userId: number };

/**
 * Creates the get status service
 */
export const getStatusService = (deps: GetStatusServiceDeps) =>
  async (gameId: string, userId: number): Promise<GetStatusResult> => {
    // Fire-and-forget health probe. Throttled internally; failures are logged at debug.
    deps.llm.probeHealth().catch(() => { /* swallow — already logged at debug */ });

    // Verify user has access to this game
    const gameState = await deps.getGameplayState({ gameId, userId });

    if (gameState.status === "game-not-found") {
      return { status: "game-not-found", gameId };
    }

    if (gameState.status !== "found") {
      return { status: "unauthorized", gameId, userId };
    }

    // Get internal game ID
    const game = await deps.findGameByPublicId(gameId);
    if (!game) {
      return { status: "game-not-found", gameId };
    }

    const rawHealth = deps.llm.getHealthState();
    const health: AiHealth | undefined =
      rawHealth && rawHealth.placement !== "unknown"
        ? { placement: rawHealth.placement, gpuPercent: rawHealth.gpuPercent }
        : undefined;

    // Check for running pipeline
    const runningPipeline = await deps.findRunningPipeline(game._id);

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

    // Check if it's AI's turn
    if (!gameState.data.currentRound) {
      return {
        status: "success",
        aiStatus: {
          available: false,
          thinking: false,
          health,
        },
      };
    }

    const currentRound = gameState.data.currentRound;
    const allPlayers = gameState.data.teams.flatMap((team) => team.players);
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
