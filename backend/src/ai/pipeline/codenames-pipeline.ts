/**
 * CODENAMES AI PIPELINE
 *
 * Orchestrates the spymaster and guesser roles:
 * - Spymaster: Generates clues for team words
 * - Guesser:   Ranks all remaining words against the clue
 *
 * Pass/decline logic lives in the AI player, not here. The pipeline
 * returns scored candidates; the player decides which (if any) to play.
 */

import type { LLMService } from "../models";
import type { AppLogger } from "@backend/shared/logging";
import { runSpymasterPipeline, type SpymasterInput, type SpymasterOutput } from "./spymaster";
import { runRanking, type RankingInput, type RankedWord } from "./guesser";
import type { PromptStyle } from "./prompts";

export type { SpymasterInput, SpymasterOutput } from "./spymaster";
export type { RankingInput, RankedWord } from "./guesser";

/**
 * Guesser input — what the pipeline needs to rank remaining board words
 * against the spymaster's clue.
 */
export type GuesserInput = {
  currentTeam: string;
  remainingWords: string[];
  clueWord: string;
  clueNumber: number;
  onPromptGenerated?: (prompt: string) => void | Promise<void>;
};

/**
 * Guesser output — the full ranked list. The decision of whether
 * to actually guess (and how many) belongs to the player.
 */
export type GuesserOutput = {
  ranked: RankedWord[];
};

export const createCodenamesPipeline = (
  llm: LLMService,
  promptStyle: PromptStyle,
  logger: AppLogger,
) => {
  const runSpymaster = async (input: SpymasterInput): Promise<SpymasterOutput> =>
    runSpymasterPipeline(llm, promptStyle, logger, input);

  const runGuess = async (input: GuesserInput): Promise<GuesserOutput> => {
    if (input.remainingWords.length === 0) {
      return { ranked: [] };
    }

    const ranked = await runRanking(
      llm,
      promptStyle,
      logger,
      {
        currentTeam: input.currentTeam,
        clueWord: input.clueWord,
        clueNumber: input.clueNumber,
        remainingWords: input.remainingWords,
      },
      input.onPromptGenerated,
    );

    logger.debug("guesser: ranker results", {
      results: ranked.map((r) => ({ word: r.word, score: r.score })),
    });

    return { ranked };
  };

  return {
    runSpymasterPipeline: runSpymaster,
    runOperativePipeline: runGuess,
  };
};

export type CodenamesPipeline = ReturnType<typeof createCodenamesPipeline>;
