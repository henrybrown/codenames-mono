/**
 * GUESSER RANKER
 *
 * Ranks all remaining board words against the Spymaster's clue.
 * Uses a few-shot example to teach the format. Validates that
 * returned words are actually on the board (prevents hallucination).
 */

import type { LLMService } from "./llm.service";
import type { PreFilterOutput } from "./guesser-prefilter";
import type { AppLogger } from "@backend/shared/logging";

export type RankingInput = {
  currentTeam: string;
  clueWord: string;
  clueNumber: number;
  candidates: PreFilterOutput[];
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
 * Build the ranking prompt.
 *
 * Design principles:
 * - One few-shot example teaches format and scoring calibration
 * - Numbered word list so the model can reference clearly
 * - Explicit reminder that the clue is NOT a board word
 * - Short prompt = more attention budget for actual word association
 */
export const buildRankingPrompt = (input: RankingInput): string => {
  const { clueWord, clueNumber, candidates } = input;

  const wordList = candidates.map((c, i) => `${i + 1}. ${c.word}`).join("\n");

  return `Codenames Guesser. The clue is a hint — pick which board words it connects to.

Example:
Clue: "fruit" for 2
Board words: 1. ROCKET 2. APPLE 3. MOON 4. CHERRY 5. HAMMER
Answer: {"ranked":[{"word":"APPLE","score":0.95,"reason":"apple is a fruit"},{"word":"CHERRY","score":0.9,"reason":"cherry is a fruit"},{"word":"MOON","score":0.05,"reason":"no link to fruit"},{"word":"ROCKET","score":0.02,"reason":"no link"},{"word":"HAMMER","score":0.01,"reason":"no link"}]}

Now your turn.
Clue: "${clueWord}" for ${clueNumber}
Board words:
${wordList}

IMPORTANT: Only use words from the numbered list above. "${clueWord}" is the clue, NOT a board word.

Answer:`;
};

/**
 * Run ranking on all remaining words
 */
export const runRanking = async (
  llm: LLMService,
  logger: AppLogger,
  input: RankingInput,
  onPromptGenerated?: (prompt: string) => void | Promise<void>,
): Promise<RankedWord[]> => {
  const prompt = buildRankingPrompt(input);

  if (onPromptGenerated) {
    await onPromptGenerated(prompt);
  }

  // Build set of valid board words for hallucination filtering
  const validWords = new Set(
    input.candidates.map((c) => c.word.toUpperCase()),
  );

  // Map for normalising casing back to original board words
  const wordCaseMap = new Map(
    input.candidates.map((c) => [c.word.toUpperCase(), c.word]),
  );

  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    attempts++;

    try {
      const result = await llm.generateJSON<RankingOutput>(prompt, {
        temperature: 0.45,
      });

      if (!result.ranked || !Array.isArray(result.ranked) || result.ranked.length === 0) {
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
