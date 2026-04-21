import { useQuery, keepPreviousData, UseQueryResult } from "@tanstack/react-query";
import { AxiosResponse } from "axios";
import api from "@frontend/shared/api/api";
import type { TurnData, TurnPhase } from "@frontend/shared/types";
import { assertPlayerRole } from "@frontend/shared/types";

export type { TurnData, TurnPhase };

interface ApiTurn {
  id: string;
  teamName: string;
  status: string;
  guessesRemaining: number;
  createdAt: string;
  completedAt: string | null;
  clue: {
    word: string;
    number: number;
    createdAt: string;
  } | null;
  hasGuesses: boolean;
  lastGuess: {
    cardWord: string;
    playerName: string;
    outcome: string;
    createdAt: string;
  } | null;
  prevGuesses: Array<{
    cardWord: string;
    playerName: string;
    outcome: string;
    createdAt: string;
  }>;
  active: {
    teamName: string;
    role: string;
    isAi: boolean;
    playerName: string | null;
  } | null;
}

interface TurnApiResponse {
  success: boolean;
  data: {
    turn: ApiTurn;
    historicTurns: ApiTurn[];
  };
}

/**
 * Response from turn query including historic turns
 */
export interface TurnQueryResult {
  turn: TurnData;
  historicTurns: TurnData[];
}

function transformApiTurn(apiTurn: ApiTurn): TurnData {
  const active: TurnPhase | null = (() => {
    if (!apiTurn.active) return null;
    assertPlayerRole(apiTurn.active.role);
    return {
      teamName: apiTurn.active.teamName,
      role: apiTurn.active.role,
      isAi: apiTurn.active.isAi,
      playerName: apiTurn.active.playerName,
    };
  })();

  return {
    id: apiTurn.id,
    teamName: apiTurn.teamName,
    status: apiTurn.status as "ACTIVE" | "COMPLETED",
    guessesRemaining: apiTurn.guessesRemaining,
    createdAt: new Date(apiTurn.createdAt),
    completedAt: apiTurn.completedAt ? new Date(apiTurn.completedAt) : null,
    clue: apiTurn.clue ? {
      word: apiTurn.clue.word,
      number: apiTurn.clue.number,
      createdAt: new Date(apiTurn.clue.createdAt),
    } : null,
    hasGuesses: apiTurn.hasGuesses,
    lastGuess: apiTurn.lastGuess ? {
      cardWord: apiTurn.lastGuess.cardWord,
      playerName: apiTurn.lastGuess.playerName,
      outcome: apiTurn.lastGuess.outcome,
      createdAt: new Date(apiTurn.lastGuess.createdAt),
    } : null,
    prevGuesses: apiTurn.prevGuesses.map(guess => ({
      cardWord: guess.cardWord,
      playerName: guess.playerName,
      outcome: guess.outcome,
      createdAt: new Date(guess.createdAt),
    })),
    active,
  };
}

const fetchTurn = async (turnId: string): Promise<TurnQueryResult> => {
  const response: AxiosResponse<TurnApiResponse> = await api.get(
    `/turns/${turnId}`,
  );

  if (!response.data.success) {
    throw new Error("Failed to fetch turn data");
  }

  return {
    turn: transformApiTurn(response.data.data.turn),
    historicTurns: response.data.data.historicTurns.map(transformApiTurn),
  };
};

/**
 * Fetches detailed turn data including full guess history and all historic turns.
 */
export const useTurnDataQuery = (
  turnId: string | null,
): UseQueryResult<TurnQueryResult, Error> => {
  return useQuery<TurnQueryResult>({
    queryKey: ["turn", turnId],
    queryFn: async () => {
      if (!turnId) {
        throw new Error("Turn ID is required");
      }
      return await fetchTurn(turnId);
    },
    enabled: !!turnId,
    placeholderData: keepPreviousData,
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: 2,
  });
};
