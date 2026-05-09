/**
 * Spymaster prompt — LOCAL model variant
 *
 * Tuned for small open-weight models (Llama 3, Qwen, Gemma, etc).
 *
 * Design principles:
 *   - Short. Small models pay attention to the start of the prompt;
 *     overlong rule lists waste their attention budget.
 *   - Examples teach the danger-word pattern, not just the format.
 *   - Output schema includes danger_opponents BEFORE clue — the act
 *     of writing them down biases the clue selection away from them.
 *   - Strict JSON via Ollama format:"json"; minimal validation prose.
 */

import type { SpymasterInput } from "../spymaster";

export const buildSpymasterPromptLocal = (
  input: SpymasterInput,
  retryNote?: string,
): string => {
  const { friendlyWords, opponentWords, neutralWords, assassinWord, previousClues } = input;

  const previousClueNote =
    previousClues.length > 0
      ? `\nAlready used clues (do not reuse): ${previousClues.join(", ")}`
      : "";

  const retryPreamble = retryNote
    ? `\nIMPORTANT: ${retryNote}\n`
    : "";

  return `Codenames Spymaster. Give a one-word clue connecting AS MANY of your team's words as possible.${retryPreamble}

Before answering, identify the 1-2 most dangerous opponent words (most theme-similar to your team's words) and the assassin. Your clue must NOT connect to those.

Connecting 3+ team words is great, 2 is good, 1 is a last resort. Your clue must NOT be a board word or a word-form of one.

Example 1:
Team: APPLE, PIE, CHERRY
Opponent: ROCKET, MOON | Assassin: BOMB
Answer: {"danger_opponents":[],"danger_assassin":"BOMB but unrelated","clue":"baking","number":3,"covers":["APPLE","PIE","CHERRY"]}

Example 2:
Team: JUPITER, SATELLITE, NET, STAR
Opponent: APPLE, MOON | Assassin: KNIFE
Answer: {"danger_opponents":["MOON"],"danger_assassin":"KNIFE unrelated","clue":"orbit","number":3,"covers":["JUPITER","SATELLITE","STAR"]}

Note in example 2: "space" would also connect MOON (opponent). "orbit" specifically excludes MOON.

Now your turn.
Team: ${friendlyWords.join(", ")}
Opponent: ${opponentWords.join(", ")} | Assassin: ${assassinWord}
Neutral: ${neutralWords.join(", ")}${previousClueNote}

Answer:`;
};
