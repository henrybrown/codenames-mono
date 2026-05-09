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

export type PromptStyle = "local" | "hosted";

export const buildSpymasterPrompt = (
  style: PromptStyle,
  input: SpymasterInput,
  retryNote?: string,
): string =>
  style === "local"
    ? buildSpymasterPromptLocal(input, retryNote)
    : buildSpymasterPromptHosted(input, retryNote);

export const buildGuesserPrompt = (
  style: PromptStyle,
  input: RankingInput,
  retryNote?: string,
): string =>
  style === "local"
    ? buildGuesserPromptLocal(input, retryNote)
    : buildGuesserPromptHosted(input, retryNote);
