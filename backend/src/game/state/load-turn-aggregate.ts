import type {
  DbContext,
  TransactionContext,
} from "@backend/shared/data-access/transaction-handler";
import * as turnsRepository from "@backend/shared/data-access/repositories/turns.repository";

export interface TurnGuess {
  cardWord: string;
  playerName: string;
  outcome: string | null;
  createdAt: Date;
}

export interface TurnClue {
  word: string;
  number: number;
  createdAt: Date;
}

export interface TurnData {
  publicId: string;
  teamName: string;
  status: "ACTIVE" | "COMPLETED";
  guessesRemaining: number;
  createdAt: Date;
  completedAt: Date | null;
  clue?: TurnClue;
  hasGuesses: boolean;
  lastGuess?: TurnGuess;
  prevGuesses: TurnGuess[];
  _gameId: number;
  _roundId: number;
}

export type TurnLoader = (publicId: string) => Promise<TurnData | null>;

/**
 * The single factory for loading turn-level state (turn + clue + guesses).
 *
 * Pure data assembly with light transformation: adds computed fields
 * (hasGuesses, lastGuess, prevGuesses) and transforms clue + guess shapes
 * for the frontend.
 *
 * Works with both regular db connections and transaction contexts.
 */
export const createTurnLoader = (
  dbContext: DbContext | TransactionContext,
): TurnLoader => {
  const getTurnByPublicId = turnsRepository.getTurnByPublicId(dbContext);

  return async (publicId) => {
    const turnData = await getTurnByPublicId(publicId);
    if (!turnData) return null;

    const transformedGuesses: TurnGuess[] = turnData.guesses.map((guess) => ({
      cardWord: guess.cardWord,
      playerName: guess.playerName,
      outcome: guess.outcome?.toString() || "",
      createdAt: guess.createdAt,
    }));

    const hasGuesses = transformedGuesses.length > 0;
    const lastGuess = hasGuesses
      ? transformedGuesses[transformedGuesses.length - 1]
      : undefined;
    const prevGuesses = hasGuesses ? transformedGuesses.slice(0, -1) : [];

    const transformedClue: TurnClue | undefined = turnData.clue
      ? {
          word: turnData.clue.word,
          number: turnData.clue.number,
          createdAt: turnData.clue.createdAt,
        }
      : undefined;

    return {
      publicId: turnData.publicId,
      teamName: turnData.teamName,
      status: turnData.status as "ACTIVE" | "COMPLETED",
      guessesRemaining: turnData.guessesRemaining,
      createdAt: turnData.createdAt,
      completedAt: turnData.completedAt,
      clue: transformedClue,
      hasGuesses,
      lastGuess,
      prevGuesses,
      _gameId: turnData._gameId,
      _roundId: turnData._roundId,
    };
  };
};
