/**
 * Guesser prompt — LOCAL model variant
 *
 * Tuned for small open-weight models. Two examples to anchor the
 * score scale; explicit reminders that the clue is not a board word.
 */

import type { RankingInput } from "../guesser";

/**
 * Builds the guesser prompt for local (small open-weight) models.
 *
 * Includes two worked examples to anchor the score scale and an explicit
 * reminder that the clue itself isn't a board word. `retryNote` is shown
 * as an IMPORTANT-prefixed instruction on subsequent attempts.
 */
export const buildGuesserPromptLocal = (
  input: RankingInput,
  retryNote?: string,
): string => {
  const { clueWord, clueNumber, remainingWords } = input;
  const wordList = remainingWords.map((w, i) => `${i + 1}. ${w}`).join("\n");

  const retryPreamble = retryNote
    ? `\nIMPORTANT: ${retryNote}\n`
    : "";

  return `Codenames Guesser. The clue is a hint — pick which board words it connects to.${retryPreamble}

Score scale (use this exactly):
- 0.85–1.00: definite, direct association (clue "fruit" → APPLE)
- 0.65–0.84: strong but not certain (clue "fruit" → PEACH if PEACH might also fit other clues)
- 0.45–0.64: plausible but a stretch (clue "orbit" → SPACE in some readings)
- 0.20–0.44: weak; only worth considering if nothing else fits
- 0.00–0.19: no real link

Example 1:
Clue: "fruit" for 2
Words: 1. ROCKET 2. APPLE 3. MOON 4. CHERRY 5. HAMMER
Answer: {"ranked":[{"word":"APPLE","score":0.95,"reason":"apple is a fruit"},{"word":"CHERRY","score":0.92,"reason":"cherry is a fruit"},{"word":"MOON","score":0.05,"reason":"no link"},{"word":"ROCKET","score":0.03,"reason":"no link"},{"word":"HAMMER","score":0.02,"reason":"no link"}]}

Example 2:
Clue: "orbit" for 3
Words: 1. JUPITER 2. APPLE 3. SATELLITE 4. KNIFE 5. STAR
Answer: {"ranked":[{"word":"JUPITER","score":0.9,"reason":"jupiter is in orbit around the sun"},{"word":"SATELLITE","score":0.88,"reason":"satellites orbit"},{"word":"STAR","score":0.55,"reason":"stars are part of orbital systems but don't 'orbit' typically"},{"word":"APPLE","score":0.05,"reason":"no link"},{"word":"KNIFE","score":0.02,"reason":"no link"}]}

Now your turn.
Clue: "${clueWord}" for ${clueNumber}
Words:
${wordList}

IMPORTANT: only use words from the numbered list. "${clueWord}" is the clue, not a board word.

Answer:`;
};
