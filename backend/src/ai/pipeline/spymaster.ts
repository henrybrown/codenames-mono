/**
 * SPYMASTER ROLE
 *
 * Generates clues for the team's words using few-shot examples.
 * The prompt is deliberately short — small models perform better
 * with examples than with long rule lists. Rule enforcement
 * (board word check, word-form check) is handled in code.
 */

import type { LLMService } from "../models";
import type { AppLogger } from "@backend/shared/logging";
import { buildSpymasterPrompt, type PromptStyle } from "./prompts";

export type SpymasterInput = {
  currentTeam: string;
  friendlyWords: string[];
  opponentWords: string[];
  neutralWords: string[];
  assassinWord: string;
  previousClues: string[];
  onPromptGenerated?: (prompt: string) => void | Promise<void>;
};

export type SpymasterOutput = {
  clue: string;
  number: number;
  explanation: string;
  /** Optional fields the model may include for transparency. Ignored by code. */
  danger_opponents?: string[];
  danger_assassin_note?: string;
  covers?: string[];
  reasoning?: string;
};

/**
 * Check if a clue is a direct word-form of any board word.
 * Catches plurals/conjugations (star→stars, break→breaking) but NOT
 * arbitrary substrings (art does NOT block "party").
 */
export const isWordFormOf = (clue: string, boardWords: string[]): boolean => {
  const clueLower = clue.toLowerCase();
  return boardWords.some((w) => {
    const wLower = w.toLowerCase();
    if (clueLower === wLower) return true;

    const longer = clueLower.length >= wLower.length ? clueLower : wLower;
    const shorter = clueLower.length >= wLower.length ? wLower : clueLower;
    const lengthDiff = longer.length - shorter.length;

    return lengthDiff > 0 && lengthDiff <= 3 && longer.startsWith(shorter);
  });
};

/**
 * Run the spymaster pipeline
 */
export const runSpymasterPipeline = async (
  llm: LLMService,
  promptStyle: PromptStyle,
  logger: AppLogger,
  input: SpymasterInput,
): Promise<SpymasterOutput> => {
  const prompt = buildSpymasterPrompt(promptStyle, input);

  if (input.onPromptGenerated) {
    await input.onPromptGenerated(prompt);
  }

  let attempts = 0;
  const maxAttempts = 8;

  const allBoardWords = [
    ...input.friendlyWords,
    ...input.opponentWords,
    ...input.neutralWords,
    input.assassinWord,
  ];

  while (attempts < maxAttempts) {
    attempts++;

    try {
      const result = await llm.generateJSON<SpymasterOutput>(prompt, {
        temperature: 0.7,
      });

      if (!result.clue || typeof result.clue !== "string") {
        logger.debug("spymaster: invalid structure", { attempt: attempts, result });
        continue;
      }

      if (!result.number || typeof result.number !== "number" || result.number < 1) {
        logger.debug("spymaster: invalid number", { attempt: attempts, number: result.number });
        continue;
      }

      const clueWordLower = result.clue.toLowerCase().trim();

      if (clueWordLower.includes(" ")) {
        logger.debug("spymaster: multi-word clue rejected", { attempt: attempts, clue: result.clue });
        continue;
      }

      if (allBoardWords.some((w) => w.toLowerCase() === clueWordLower)) {
        logger.debug("spymaster: clue is a board word", { attempt: attempts, clue: result.clue });
        continue;
      }

      if (isWordFormOf(clueWordLower, allBoardWords)) {
        logger.debug("spymaster: clue is word-form of board word", { attempt: attempts, clue: result.clue });
        continue;
      }

      if (input.previousClues.some((c) => c.toLowerCase() === clueWordLower)) {
        logger.debug("spymaster: clue previously used", { attempt: attempts, clue: result.clue });
        continue;
      }

      logger.info("spymaster: clue accepted", {
        clue: result.clue,
        number: result.number,
        attempt: attempts,
      });

      return {
        clue: result.clue.trim(),
        number: result.number,
        explanation: result.explanation || result.reasoning || "",
        danger_opponents: result.danger_opponents,
        danger_assassin_note: result.danger_assassin_note,
        covers: result.covers,
        reasoning: result.reasoning,
      };
    } catch (error) {
      logger.warn("spymaster: attempt failed", {
        attempt: attempts,
        maxAttempts,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      if (attempts >= maxAttempts) {
        logger.error("spymaster: exhausted attempts", {
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
    `Failed to get valid spymaster clue after ${maxAttempts} attempts`,
  );
  logger.error("spymaster: exhausted validation attempts", {
    maxAttempts,
    error: exhaustionError.message,
  });
  throw exhaustionError;
};
