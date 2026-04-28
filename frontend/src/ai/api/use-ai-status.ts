import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { AxiosResponse } from "axios";
import api from "@frontend/shared/api/api";

export type HealthPlacement = "gpu" | "partial" | "cpu" | "not-loaded" | "unknown";

export interface AiHealth {
  placement: HealthPlacement;
  gpuPercent: number;
}

interface AiStatusApiResponse {
  success: boolean;
  data: {
    available: boolean;  // Is it AI's turn and can trigger?
    thinking: boolean;   // Is pipeline currently running?
    runId?: string;      // Current run ID if thinking
    health?: AiHealth;
  };
}

export interface AiStatus {
  available: boolean;
  thinking: boolean;
  runId?: string;
  health?: AiHealth;
}

/**
 * Fetches the current AI status for a game.
 * Returns whether AI can be triggered and if it's currently thinking.
 */
export const useAiStatus = (gameId: string): UseQueryResult<AiStatus, Error> => {
  return useQuery({
    queryKey: ["game", gameId, "ai", "status"],
    queryFn: async () => {
      console.debug("[AI] Fetching AI status for game:", gameId);
      const response: AxiosResponse<AiStatusApiResponse> = await api.get(
        `/games/${gameId}/ai/status`,
      );

      if (!response.data.success) {
        console.debug("[AI] AI status fetch failed");
        throw new Error("Failed to fetch AI status");
      }

      console.debug("[AI] AI status:", response.data.data);
      return response.data.data;
    },
    refetchInterval: (query) => {
      /** Poll every 2 seconds if AI is thinking */
      const interval = query.state.data?.thinking ? 2000 : false;
      if (interval) {
        console.debug("[AI] Polling AI status (thinking=true)");
      }
      return interval;
    },
  });
};
