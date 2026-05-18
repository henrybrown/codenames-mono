import { TurnLoader, TurnData } from "@backend/game/state/load-turn-aggregate";
import { TurnsFinder, RoundId, TurnResult } from "@backend/shared/data-access/repositories/turns.repository";
import { PlayerFinderAll, RoundId as PlayerRoundId } from "@backend/shared/data-access/repositories/players.repository";
import { TurnPhase, Player } from "@backend/game/state/types";
import { computeTurnPhase } from "@backend/game/state/helpers";

/**
 * API-facing turn shape — no internal numeric ids.
 *
 * `hasGuesses`, `lastGuess`, and `prevGuesses` are derived presentation
 * fields (the underlying turn carries a single `guesses` array).
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

/** Full get-turn payload: the requested turn plus all sibling turns. */
export interface GetTurnResponse {
  turn: ApiTurnData;
  historicTurns: ApiTurnData[];
}

/** Service-call signature for fetching a single turn by public id. */
export type GetTurnService = (
  publicTurnId: string,
) => Promise<GetTurnResponse | null>;

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

const transformProviderTurnToApi = (turnData: TurnData, active: TurnPhase | null): ApiTurnData => ({
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

/** Wiring dependencies for the get-turn service. */
export interface GetTurnServiceDeps {
  loadTurn: TurnLoader;
  getTurnsByRoundId: TurnsFinder<RoundId>;
  findPlayersByRoundId: PlayerFinderAll<PlayerRoundId>;
}

/**
 * Builds the get-turn service.
 *
 * Returns `null` when the public turn id is unknown. On hit, also fetches
 * the sibling turns in the same round so the response can show full
 * round history without a separate request.
 */
export const getTurnService =
  ({ loadTurn, getTurnsByRoundId, findPlayersByRoundId }: GetTurnServiceDeps): GetTurnService =>
  async (publicTurnId) => {
    const turnData = await loadTurn(publicTurnId);

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
