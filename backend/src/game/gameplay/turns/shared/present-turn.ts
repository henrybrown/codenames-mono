/**
 * Builds the complete API-shaped turn data for a turn response.
 *
 * Used by both give-clue and make-guess services to shape the
 * `turn` field of their success responses. Loads turn data via
 * the supplied loader, then enriches it with the computed
 * active-phase derived from the round's player roster.
 *
 * Pure orchestration of loader + helpers; no DB access of its own.
 */
import type { TurnLoader } from "@backend/game/state/load-turn-aggregate";
import { computeTurnPhase } from "@backend/game/state/helpers";
import type { Player, TurnPhase } from "@backend/game/state/types";

export type CompleteTurnData = {
  id: string;
  teamName: string;
  status: "ACTIVE" | "COMPLETED";
  guessesRemaining: number;
  createdAt: Date;
  completedAt?: Date | null;
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
};

type PresentTurnPlayerInfo = Pick<
  Player,
  "publicName" | "teamName" | "_teamId" | "role" | "isAi"
>;

/**
 * Loads a turn by publicId and shapes it into the API response shape.
 *
 * Returns null if the turn can't be loaded (caller decides what to do).
 */
export const buildCompleteTurnData = async (
  loadTurn: TurnLoader,
  turnPublicId: string,
  players: PresentTurnPlayerInfo[],
): Promise<CompleteTurnData | null> => {
  const turnData = await loadTurn(turnPublicId);
  if (!turnData) return null;

  // Look up the active player's team_id from the loaded turn's teamName.
  // Match against the round's player roster (players carry teamName).
  const turnForPhase = {
    status: turnData.status,
    _teamId: players.find((p) => p.teamName === turnData.teamName)?._teamId ?? 0,
    clue: turnData.clue,
  };

  return {
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
    active: computeTurnPhase(turnForPhase, players),
  };
};
