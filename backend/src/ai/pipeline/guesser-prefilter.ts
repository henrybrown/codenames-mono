/**
 * GUESSER PRE-FILTER (Stage 1)
 *
 * Evaluates words in batches for confidence level.
 * Filters out words with "no link" to the clue.
 *
 * Key improvement: batches 5 words per LLM call instead of 1,
 * cutting latency by ~5x while giving the model cross-word context.
 */

import type { LLMService } from "./llm.service";
import type { AppLogger } from "@backend/shared/logging";

/**
 * Pre-filter Input/Output
 */
export type PreFilterInput = {
  clueWord: string;
  word: string;
};

export type PreFilterOutput = {
  word: string;
  link_confidence: "extremely" | "moderately" | "no link";
  reason: string;
};

const BATCH_SIZE = 5;

/**
 * Build the pre-filter prompt for a batch of words
 */
export const buildBatchPreFilterPrompt = (clueWord: string, words: string[]): string => {
  const wordList = words.map((w, i) => `${i + 1}. ${w}`).join("\n");

  return `You are a Guesser in Codenames. The Spymaster gave the clue: "${clueWord}"

Evaluate how strongly EACH of the following words connects to that clue.

WORDS TO EVALUATE:
${wordList}

For each word, decide:
- "extremely": strong, direct connection (e.g., clue "orbit" → JUPITER is extremely linked)
- "moderately": plausible but less certain (e.g., clue "orbit" → SPACE is moderately linked)
- "no link": no meaningful connection (e.g., clue "orbit" → HAMMER has no link)

Respond with a JSON array containing one object per word, in the same order as above:

\`\`\`json
[
  { "word": "WORD1", "link_confidence": "extremely", "reason": "brief explanation" },
  { "word": "WORD2", "link_confidence": "no link", "reason": "brief explanation" }
]
\`\`\`

Rules:
- Evaluate EVERY word in the list. Do not skip any.
- Consider common associations, synonyms, categories, and thematic links.
- Do not use extremely obscure meanings or rare slang.
- Output ONLY the JSON array, no extra text.`;
};

/**
 * Build the pre-filter prompt for a single word (fallback)
 */
export const buildPreFilterPrompt = (input: PreFilterInput): string => {
  const { clueWord, word } = input;

  return `You are a Guesser in Codenames. The Spymaster gave the clue: "${clueWord}"

Evaluate how strongly the word "${word}" connects to that clue.

Decide:
- "extremely": strong, direct connection
- "moderately": plausible but less certain
- "no link": no meaningful connection

Respond with a JSON object:

\`\`\`json
{
  "word": "${word}",
  "link_confidence": "extremely" | "moderately" | "no link",
  "reason": "brief explanation"
}
\`\`\`

Output ONLY the JSON object, no extra text.`;
};

/**
 * Validate a single pre-filter result has all required fields
 * and a valid link_confidence value
 */
export const isValidPreFilterResult = (r: unknown): r is PreFilterOutput => {
  if (!r || typeof r !== "object") return false;
  const obj = r as Record<string, unknown>;
  return (
    typeof obj.word === "string" &&
    typeof obj.link_confidence === "string" &&
    ["extremely", "moderately", "no link"].includes(obj.link_confidence) &&
    typeof obj.reason === "string"
  );
};

/**
 * Run pre-filter for all remaining words using batched LLM calls
 */
export const runPreFilter = async (
  llm: LLMService,
  logger: AppLogger,
  clueWord: string,
  remainingWords: string[],
  onComplete?: (allResults: PreFilterOutput[]) => void | Promise<void>,
  onWordEvaluated?: (result: PreFilterOutput) => void | Promise<void>,
  onPromptGenerated?: (prompt: string) => void | Promise<void>,
): Promise<PreFilterOutput[]> => {
  const results: PreFilterOutput[] = [];

  // Process in batches
  for (let i = 0; i < remainingWords.length; i += BATCH_SIZE) {
    const batch = remainingWords.slice(i, i + BATCH_SIZE);

    // Use single-word prompt if only 1 word in batch
    if (batch.length === 1) {
      const singleResult = await evaluateSingleWord(
        llm,
        logger,
        clueWord,
        batch[0],
        onPromptGenerated,
      );
      results.push(singleResult);
      if (onWordEvaluated) {
        await onWordEvaluated(singleResult);
      }
      continue;
    }

    const prompt = buildBatchPreFilterPrompt(clueWord, batch);

    if (onPromptGenerated) {
      await onPromptGenerated(prompt);
    }

    let attempts = 0;
    const maxAttempts = 3;
    let batchProcessed = false;

    while (attempts < maxAttempts && !batchProcessed) {
      attempts++;

      try {
        const batchResults = await llm.generateJSON<PreFilterOutput[]>(prompt, {
          temperature: 0.2,
        });

        if (!Array.isArray(batchResults) || batchResults.length === 0) {
          logger.debug("prefilter: empty batch response", { attempt: attempts, batchWords: batch });
          continue;
        }

        // Validate and collect results
        for (const result of batchResults) {
          if (isValidPreFilterResult(result)) {
            results.push(result);
            if (onWordEvaluated) {
              await onWordEvaluated(result);
            }
          }
        }

        // Check we got results for all words in the batch.
        // Any missing words get marked as "no link".
        const resultWords = new Set(results.map((r) => r.word.toUpperCase()));
        for (const word of batch) {
          if (!resultWords.has(word.toUpperCase())) {
            logger.warn("prefilter: word missing from batch response", {
              word,
              clueWord,
              batchWords: batch,
            });
            const missingResult: PreFilterOutput = {
              word,
              link_confidence: "no link",
              reason: "Not returned in batch evaluation",
            };
            results.push(missingResult);
            if (onWordEvaluated) {
              await onWordEvaluated(missingResult);
            }
          }
        }

        batchProcessed = true;
      } catch (error) {
        logger.warn("prefilter: batch attempt failed", {
          attempt: attempts,
          maxAttempts,
          clueWord,
          batchWords: batch,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        if (attempts >= maxAttempts) {
          logger.error("prefilter: batch exhausted, falling back to no-link", {
            clueWord,
            batchWords: batch,
            error: error instanceof Error ? error.message : String(error),
          });
          // Fall back: mark all words in this batch as "no link"
          for (const word of batch) {
            const alreadyHasResult = results.some(
              (r) => r.word.toUpperCase() === word.toUpperCase(),
            );
            if (!alreadyHasResult) {
              const failedResult: PreFilterOutput = {
                word,
                link_confidence: "no link",
                reason: "Failed to evaluate in batch",
              };
              results.push(failedResult);
              if (onWordEvaluated) {
                await onWordEvaluated(failedResult);
              }
            }
          }
        }
      }
    }
  }

  if (onComplete) {
    await onComplete(results);
  }

  // Filter candidates: keep "extremely" and "moderately" confident words
  const candidates = results.filter(
    (r) => r.link_confidence === "extremely" || r.link_confidence === "moderately",
  );

  return candidates;
};

/**
 * Evaluate a single word (used for batches of 1 or as fallback)
 */
const evaluateSingleWord = async (
  llm: LLMService,
  logger: AppLogger,
  clueWord: string,
  word: string,
  onPromptGenerated?: (prompt: string) => void | Promise<void>,
): Promise<PreFilterOutput> => {
  const prompt = buildPreFilterPrompt({ clueWord, word });

  if (onPromptGenerated) {
    await onPromptGenerated(prompt);
  }

  let attempts = 0;
  const maxAttempts = 3;
  let lastError: unknown;

  while (attempts < maxAttempts) {
    attempts++;

    try {
      const result = await llm.generateJSON<PreFilterOutput>(prompt, {
        temperature: 0.2,
      });

      if (isValidPreFilterResult(result)) {
        return result;
      }
      logger.debug("prefilter: single-word invalid result", { attempt: attempts, word, result });
    } catch (error) {
      lastError = error;
      logger.warn("prefilter: single-word attempt failed", {
        attempt: attempts,
        maxAttempts,
        word,
        clueWord,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }

  logger.error("prefilter: single-word exhausted, falling back to no-link", {
    word,
    clueWord,
    attempts,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  });

  return {
    word,
    link_confidence: "no link",
    reason: "Failed to evaluate",
  };
};
