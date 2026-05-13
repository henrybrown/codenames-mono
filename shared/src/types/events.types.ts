/**
 * Event types that can occur during gameplay
 */
export const GAME_EVENT_TYPE = {
  DEAL: 'deal',
  SELECT: 'select',
  REVEAL_COLORS: 'reveal_colors',
  HIDE_COLORS: 'hide_colors',
  GIVE_CLUE: 'give_clue',
  MAKE_GUESS: 'make_guess',
} as const;
