/**
 * Prompt selector — picks the right prompt family based on prompt style.
 *
 * promptStyle is derived from the configured LLM provider. Local
 * (small open-weight) and hosted (large frontier) models benefit from
 * different prompt structures; we keep both and route at the boundary.
 */

import type { SpymasterInput } from "../spymaster";
import type { RankingInput } from "../guesser";
import { buildSpymasterPromptLocal } from "./spymaster.local";
import { buildSpymasterPromptHosted } from "./spymaster.hosted";
import { buildGuesserPromptLocal } from "./guesser.local";
import { buildGuesserPromptHosted } from "./guesser.hosted";

/** Model-class hint used to pick the prompt variant. */
export type PromptStyle = "local" | "hosted";

/**
 * Dispatches to the spymaster prompt variant for the given model class.
 *
 * `retryNote`, when provided, is included in the prompt as a correction
 * instruction for the previous attempt's failure mode.
 */
export const buildSpymasterPrompt = (
  style: PromptStyle,
  input: SpymasterInput,
  retryNote?: string,
): string =>
  style === "local"
    ? buildSpymasterPromptLocal(input, retryNote)
    : buildSpymasterPromptHosted(input, retryNote);

/**
 * Dispatches to the guesser prompt variant for the given model class.
 *
 * `retryNote`, when provided, is included as a correction instruction.
 */
export const buildGuesserPrompt = (
  style: PromptStyle,
  input: RankingInput,
  retryNote?: string,
): string =>
  style === "local"
    ? buildGuesserPromptLocal(input, retryNote)
    : buildGuesserPromptHosted(input, retryNote);
