/**
 * GUESSER RANKER
 *
 * Ranks all remaining board words against the Spymaster's clue.
 * Uses a few-shot example to teach the format. Validates that
 * returned words are actually on the board (prevents hallucination).
 */

import type { LLMService } from "../models";
import type { AppLogger } from "@backend/shared/logging";
import { buildGuesserPrompt, type PromptStyle } from "./prompts";

export type RankingInput = {
  currentTeam: string;
  clueWord: string;
  clueNumber: number;
  /** All board words still in play; the guesser scores each one against the clue. */
  remainingWords: string[];
};

export type RankedWord = {
  word: string;
  score: number;
  reason: string;
};

export type RankingOutput = {
  ranked: RankedWord[];
};

/**
 * Run ranking on all remaining words
 */
export const runRanking = async (
  llm: LLMService,
  promptStyle: PromptStyle,
  logger: AppLogger,
  input: RankingInput,
  onPromptGenerated?: (prompt: string) => void | Promise<void>,
): Promise<RankedWord[]> => {
  const prompt = buildGuesserPrompt(promptStyle, input);

  if (onPromptGenerated) {
    await onPromptGenerated(prompt);
  }

  // Build set of valid board words for hallucination filtering
  const validWords = new Set(
    input.remainingWords.map((w) => w.toUpperCase()),
  );

  // Map for normalising casing back to original board words
  const wordCaseMap = new Map(
    input.remainingWords.map((w) => [w.toUpperCase(), w]),
  );

  let attempts = 0;
  const maxAttempts = 3;
  let lastRejectionReason: string | undefined;

  while (attempts < maxAttempts) {
    attempts++;

    const attemptPrompt =
      attempts === 1
        ? prompt
        : buildGuesserPrompt(promptStyle, input, lastRejectionReason);

    if (attempts > 1 && onPromptGenerated) {
      await onPromptGenerated(attemptPrompt);
    }

    try {
      const result = await llm.generateJSON<RankingOutput>(attemptPrompt, {
        temperature: 0.45,
      });

      if (!result.ranked || !Array.isArray(result.ranked) || result.ranked.length === 0) {
        lastRejectionReason = "your previous answer had no 'ranked' array — return JSON with a 'ranked' array of word/score/reason objects";
        logger.debug("ranker: empty ranked array", { attempt: attempts });
        continue;
      }

      // Filter to only valid board words with proper fields
      const validEntries = result.ranked.filter((r) => {
        if (typeof r.word !== "string" || typeof r.score !== "number" || typeof r.reason !== "string") {
          return false;
        }
        if (r.score < 0 || r.score > 1) {
          return false;
        }
        // CRITICAL: reject words that aren't on the board
        if (!validWords.has(r.word.toUpperCase())) {
          logger.warn("ranker: filtered hallucinated word", { word: r.word, attempt: attempts });
          return false;
        }
        return true;
      });

      if (validEntries.length === 0) {
        const example = result.ranked.find((r) => typeof r.word === "string");
        lastRejectionReason = example
          ? `your previous answer used "${example.word}" which is not on the board — only use words from the numbered list`
          : "your previous answer had no valid words — only use words from the numbered list";
        logger.debug("ranker: no valid board words in response", { attempt: attempts });
        continue;
      }

      // Normalise casing to match original board words
      for (const entry of validEntries) {
        entry.word = wordCaseMap.get(entry.word.toUpperCase()) || entry.word;
      }

      validEntries.sort((a, b) => b.score - a.score);

      logger.info("ranker: accepted", {
        results: validEntries.map((r) => ({ word: r.word, score: r.score })),
        attempt: attempts,
      });

      return validEntries;
    } catch (error) {
      lastRejectionReason = "your previous answer was not valid JSON — respond with a JSON object only";
      logger.warn("ranker: attempt failed", {
        attempt: attempts,
        maxAttempts,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      if (attempts >= maxAttempts) {
        logger.error("ranker: exhausted attempts", {
          attempts,
          maxAttempts,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        throw error;
      }
    }
  }

  const exhaustionError = new Error(
    `Failed to rank candidates after ${maxAttempts} attempts`,
  );
  logger.error("ranker: exhausted validation attempts", {
    maxAttempts,
    error: exhaustionError.message,
  });
  throw exhaustionError;
};
