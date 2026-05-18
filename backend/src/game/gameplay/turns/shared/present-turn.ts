/**
 * Shared turn-presentation helpers used by the gameplay services that
 * need a fully-shaped turn in their response.
 *
 * Pure orchestration of loader + helpers; no DB access of its own.
 */
import type { TurnLoader } from "@backend/game/state/load-turn-aggregate";
import { computeTurnPhase } from "@backend/game/state/helpers";
import type { Player, TurnPhase } from "@backend/game/state/types";

/**
 * Full API-shaped turn payload returned on a successful give-clue or
 * make-guess. Includes derived `hasGuesses` / `lastGuess` / `prevGuesses`
 * fields and the active turn phase.
 */
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
