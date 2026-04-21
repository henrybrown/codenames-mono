/**
 * CODENAMES AI PIPELINE
 *
 * Orchestrates the spymaster and guesser roles:
 * - Spymaster: Generates clues for team words
 * - Guesser: Ranks all remaining words against the clue in a single LLM call
 */

import type { LLMService } from "./llm.service";
import type { AppLogger } from "@backend/shared/logging";
import { runSpymasterPipeline, type SpymasterInput, type SpymasterOutput } from "./spymaster";
import { runRanking, type RankingInput } from "./guesser-ranker";

/**
 * Re-export types for external use
 */
export type { SpymasterInput, SpymasterOutput } from "./spymaster";
export type { PreFilterInput, PreFilterOutput } from "./guesser-prefilter";
export type { RankingInput, RankedWord, RankingOutput } from "./guesser-ranker";

/**
 * Guesser Input
 */
export type GuesserInput = {
  currentTeam: string;
  remainingWords: string[];
  clueWord: string;
  clueNumber: number;
  onPrefilterComplete?: (results: import("./guesser-prefilter").PreFilterOutput[]) => void | Promise<void>;
  onWordEvaluated?: (result: import("./guesser-prefilter").PreFilterOutput) => void | Promise<void>;
  onPromptGenerated?: (prompt: string) => void | Promise<void>;
};

/**
 * Guesser Output
 */
export type GuesserDecision = {
  action: "guess" | "stop";
  word?: string;
  confidence: number;
  reason: string;
  rankedList?: Array<{ word: string; score: number; reason: string }>;
};

/**
 * Create the complete Codenames AI pipeline
 */
export const createCodenamesPipeline = (llm: LLMService, logger: AppLogger) => {
  const runSpymaster = async (input: SpymasterInput): Promise<SpymasterOutput> => {
    return runSpymasterPipeline(llm, logger, input);
  };

  /**
   * Single-stage guesser: rank all remaining words directly, always guess the best one.
   *
   * The previous two-stage approach (prefilter → ranker) was too aggressive with
   * small local models — the prefilter would kill good words with a binary "no link"
   * verdict before the ranker ever saw them, and the confidence threshold would then
   * refuse to guess even when there were decent matches.
   */
  const runGuesser = async (input: GuesserInput): Promise<GuesserDecision> => {
    if (input.remainingWords.length === 0) {
      return {
        action: "stop",
        confidence: 1,
        reason: "No words remaining",
      };
    }

    // Build dummy candidates so the ranker input type is satisfied.
    // These don't carry any prefilter scoring — the ranker prompt
    // now ignores link_confidence and just works from the word list.
    const allWords = input.remainingWords.map((word) => ({
      word,
      link_confidence: "unscored" as const,
      reason: "",
    }));

    // Fire the prefilter callback so the UI layer doesn't break
    if (input.onPrefilterComplete) {
      await input.onPrefilterComplete(allWords as any);
    }

    // Single LLM call: rank every remaining word against the clue
    const ranked = await runRanking(
      llm,
      logger,
      {
        currentTeam: input.currentTeam,
        clueWord: input.clueWord,
        clueNumber: input.clueNumber,
        candidates: allWords as any,
      },
      input.onPromptGenerated,
    );

    const topChoice = ranked[0];

    logger.debug("guesser: ranker results", {
      results: ranked.map((r) => ({ word: r.word, score: r.score })),
    });

    // Always guess. The Spymaster gave a clue — there is always a best match.
    return {
      action: "guess",
      word: topChoice.word,
      confidence: topChoice.score,
      reason: topChoice.reason,
      rankedList: ranked,
    };
  };

  return {
    runSpymasterPipeline: runSpymaster,
    runOperativePipeline: runGuesser,
  };
};

export type CodenamesPipeline = ReturnType<typeof createCodenamesPipeline>;
