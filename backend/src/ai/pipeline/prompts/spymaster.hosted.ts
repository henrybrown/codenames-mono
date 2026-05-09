/**
 * Spymaster prompt — HOSTED model variant
 *
 * Tuned for capable hosted models (Claude, GPT-4-class, Gemini Pro).
 *
 * Design principles:
 *   - Larger models reliably follow explicit multi-criteria instructions;
 *     we use that to enforce risk-aware clue selection.
 *   - Output schema asks for the model's reasoning about danger words
 *     BEFORE the clue, so the clue is conditioned on that reasoning.
 *   - One worked example with rationale; no second example needed.
 */

import type { SpymasterInput } from "../spymaster";

export const buildSpymasterPromptHosted = (
  input: SpymasterInput,
  retryNote?: string,
): string => {
  const { friendlyWords, opponentWords, neutralWords, assassinWord, previousClues } = input;

  const previousClueLine =
    previousClues.length > 0
      ? `\nAlready used clues (do not reuse): ${previousClues.join(", ")}`
      : "";

  const retryPreamble = retryNote
    ? `\n\nNOTE: ${retryNote}\n`
    : "";

  return `You are the Spymaster in Codenames. Give a one-word clue that helps your team identify their words while avoiding opponent and assassin words.${retryPreamble}

Strategy:
1. First, identify the 1–2 opponent words MOST thematically similar to your team's words. These are danger words — your clue must not connect to them.
2. Identify whether the assassin word is in any way related to a clue you might give. If it is, choose a clue that excludes it cleanly.
3. Connecting 3+ of your team's words with a single clue is the goal. 2 is good. 1 is only acceptable if there's no safe broader clue.
4. Your clue must NOT be any word on the board, and not a word-form (plural, conjugation, hyphenation) of one.

Worked example:
Team words: JUPITER, SATELLITE, NET, STAR
Opponent words: APPLE, MOON
Assassin: KNIFE
Reasoning: "space" would naturally connect JUPITER, SATELLITE, STAR — but also MOON (opponent). "orbit" specifically connects astronomical body and trajectory concepts (JUPITER, SATELLITE, STAR) while excluding MOON, which orbits things rather than orbiting itself in common usage. Assassin KNIFE is unrelated.
Answer: {"danger_opponents":["MOON"],"danger_assassin_note":"KNIFE unrelated to clue","reasoning":"orbit covers the celestial-bodies-in-motion theme without overlapping MOON which is itself an orbited object","clue":"orbit","covers":["JUPITER","SATELLITE","STAR"],"number":3}

Now your turn.
Team words: ${friendlyWords.join(", ")}
Opponent words: ${opponentWords.join(", ")}
Assassin: ${assassinWord}
Neutral: ${neutralWords.join(", ")}${previousClueLine}

Respond with JSON in the same shape as the worked example. Do NOT include the example fields verbatim — fill them in for THIS board.`;
};
