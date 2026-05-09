/**
 * Guesser prompt — HOSTED model variant
 *
 * Larger models can use a calibrated rubric without examples for every
 * score band; we describe the scale clearly and trust them to apply it.
 */

import type { RankingInput } from "../guesser";

export const buildGuesserPromptHosted = (
  input: RankingInput,
  retryNote?: string,
): string => {
  const { clueWord, clueNumber, remainingWords } = input;
  const wordList = remainingWords.map((w, i) => `${i + 1}. ${w}`).join("\n");

  const retryPreamble = retryNote
    ? `\n\nNOTE: ${retryNote}\n`
    : "";

  return `You are the Guesser in Codenames. The Spymaster has given a clue. Score every remaining board word by how strongly it connects to the clue.${retryPreamble}

Scoring rubric (use precisely):
- 0.85–1.00: direct, unambiguous association ("fruit" → APPLE)
- 0.65–0.84: strong link, minor uncertainty ("fruit" → PEACH when other readings exist)
- 0.45–0.64: plausible secondary reading; the connection is real but not the first thing you'd think
- 0.20–0.44: weak — the words touch a shared theme distantly
- 0.00–0.19: no meaningful link

The Spymaster meant the clue to point to ${clueNumber} word(s), so expect ${clueNumber} word(s) to score in the 0.65+ band. Do not invent strong connections to fill quota — if only one word truly fits, score the rest honestly.

Clue: "${clueWord}" (for ${clueNumber})
Board words:
${wordList}

Constraints:
- Only score words from the numbered list above.
- "${clueWord}" is the clue, not a board word — do not include it.
- Output every word from the list (full ranking, sorted descending by score).

Respond with JSON:
{"ranked":[{"word":"<BOARD_WORD>","score":<0..1>,"reason":"<short>"}, ...]}`;
};
