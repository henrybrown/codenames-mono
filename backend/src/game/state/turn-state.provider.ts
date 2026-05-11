import {
  TurnFinder,
  PublicId,
} from "@backend/shared/data-access/repositories/turns.repository";

/**
 * Turn guess data with card word included
 */
export interface TurnGuess {
  cardWord: string;
  playerName: string;
  outcome: string | null;
  createdAt: Date;
}

/**
 * Turn clue data
 */
export interface TurnClue {
  word: string;
  number: number;
  createdAt: Date;
}

/**
 * Complete turn data with computed fields (provider return type)
 */
export interface ProviderTurnData {
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
  // Internal fields for service layer
  _gameId: number;
  _roundId: number;
}

export type TurnStateProvider = (
  publicId: string,
) => Promise<ProviderTurnData | null>;

/**
 * Provider that gets turn data with computed fields from repository
 */
export const turnStateProvider =
  (getTurnByPublicId: TurnFinder<PublicId>): TurnStateProvider =>
  async (publicId) => {
    // Get the raw turn data from repository
    const turnData = await getTurnByPublicId(publicId);

    if (!turnData) {
      return null;
    }

    // Transform guesses to frontend format with computed fields
    const transformedGuesses: TurnGuess[] = turnData.guesses.map((guess) => ({
      cardWord: guess.cardWord,
      playerName: guess.playerName,
      outcome: guess.outcome?.toString() || "",
      createdAt: guess.createdAt,
    }));

    // Compute derived fields
    const hasGuesses = transformedGuesses.length > 0;
    const lastGuess = hasGuesses
      ? transformedGuesses[transformedGuesses.length - 1]
      : undefined;
    const prevGuesses = hasGuesses ? transformedGuesses.slice(0, -1) : [];

    // Transform clue if present
    const transformedClue: TurnClue | undefined = turnData.clue
      ? {
          word: turnData.clue.word,
          number: turnData.clue.number,
          createdAt: turnData.clue.createdAt,
        }
      : undefined;

    // Return complete turn data with computed fields and internal IDs
    return {
      // Raw data
      publicId: turnData.publicId,
      teamName: turnData.teamName,
      status: turnData.status as "ACTIVE" | "COMPLETED",
      guessesRemaining: turnData.guessesRemaining,
      createdAt: turnData.createdAt,
      completedAt: turnData.completedAt,
      clue: transformedClue,

      // Computed fields
      hasGuesses,
      lastGuess,
      prevGuesses,

      // Internal fields for service layer auth/logic
      _gameId: turnData._gameId,
      _roundId: turnData._roundId,
    };
  };
