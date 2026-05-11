import { TurnStateProvider, ProviderTurnData } from "@backend/game/state/turn-state.provider";
import { TurnsFinder, RoundId, TurnResult } from "@backend/shared/data-access/repositories/turns.repository";
import { PlayerFinderAll, RoundId as PlayerRoundId } from "@backend/shared/data-access/repositories/players.repository";
import { TurnPhase, Player } from "@backend/game/state/types";
import { computeTurnPhase } from "@backend/game/state/helpers";

/**
 * API response turn data (sanitized - no internal IDs)
 */
export interface ApiTurnData {
  id: string;
  teamName: string;
  status: "ACTIVE" | "COMPLETED";
  guessesRemaining: number;
  createdAt: Date;
  completedAt: Date | null;
  clue?: {
    word: string;
    number: number;
    createdAt: Date;
  };
  hasGuesses: boolean;
  lastGuess?: {
    cardWord: string;
    playerName: string;
    outcome: string | null;
    createdAt: Date;
  };
  prevGuesses: {
    cardWord: string;
    playerName: string;
    outcome: string | null;
    createdAt: Date;
  }[];
  active: TurnPhase | null;
}

export interface GetTurnResponse {
  turn: ApiTurnData;
  historicTurns: ApiTurnData[];
}

export type GetTurnService = (
  publicTurnId: string,
) => Promise<GetTurnResponse | null>;

/**
 * Transform a turn result from repository to API format
 */
const transformTurnToApi = (turn: TurnResult, players: Player[]): ApiTurnData => {
  const guesses = turn.guesses.map((g) => ({
    cardWord: g.cardWord,
    playerName: g.playerName,
    outcome: g.outcome,
    createdAt: g.createdAt,
  }));

  const hasGuesses = guesses.length > 0;
  const lastGuess = hasGuesses ? guesses[guesses.length - 1] : undefined;
  const prevGuesses = hasGuesses ? guesses.slice(0, -1) : [];

  return {
    id: turn.publicId,
    teamName: turn.teamName,
    status: turn.status as "ACTIVE" | "COMPLETED",
    guessesRemaining: turn.guessesRemaining,
    createdAt: turn.createdAt,
    completedAt: turn.completedAt,
    clue: turn.clue
      ? {
          word: turn.clue.word,
          number: turn.clue.number,
          createdAt: turn.clue.createdAt,
        }
      : undefined,
    hasGuesses,
    lastGuess,
    prevGuesses,
    active: computeTurnPhase(turn, players),
  };
};

/**
 * Transform provider turn data to API format
 */
const transformProviderTurnToApi = (turnData: ProviderTurnData, active: TurnPhase | null): ApiTurnData => ({
  id: turnData.publicId,
  teamName: turnData.teamName,
  status: turnData.status,
  guessesRemaining: turnData.guessesRemaining,
  createdAt: turnData.createdAt,
  completedAt: turnData.completedAt,
  clue: turnData.clue,
  hasGuesses: turnData.hasGuesses,
  lastGuess: turnData.lastGuess,
  prevGuesses: turnData.prevGuesses,
  active,
});

export interface GetTurnServiceDeps {
  getTurnState: TurnStateProvider;
  getTurnsByRoundId: TurnsFinder<RoundId>;
  findPlayersByRoundId: PlayerFinderAll<PlayerRoundId>;
}

/**
 * Service for fetching turn data with historic turns for API response
 */
export const getTurnService =
  ({ getTurnState, getTurnsByRoundId, findPlayersByRoundId }: GetTurnServiceDeps): GetTurnService =>
  async (publicTurnId) => {
    const turnData = await getTurnState(publicTurnId);

    if (!turnData) {
      return null;
    }

    const [allTurns, players] = await Promise.all([
      getTurnsByRoundId(turnData._roundId),
      findPlayersByRoundId(turnData._roundId),
    ]);

    const matchingTurn = allTurns.find((t) => t.publicId === turnData.publicId);
    const active = matchingTurn ? computeTurnPhase(matchingTurn, players) : null;

    const turn = transformProviderTurnToApi(turnData, active);
    const historicTurns = allTurns.map((t) => transformTurnToApi(t, players));

    return {
      turn,
      historicTurns,
    };
  };
