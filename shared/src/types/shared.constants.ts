/**
 * Object representing teams in the game.
 * @readonly
 * @enum {string}
 */
export const CARD_TYPE = {
  TEAM: "team",
  ASSASSIN: "assassin",
  BYSTANDER: "bystander",
} as const;

/**
 * Object representing the different round outcomes.
 * @readonly
 * @enum {string}
 */
export const CODEBREAKER_OUTCOME = {
  OTHER_TEAM_CARD: "OTHER_TEAM_CARD",
  BYSTANDER_CARD: "BYSTANDER_CARD",
  ASSASSIN_CARD: "ASSASSIN_CARD",
  CORRECT_TEAM_CARD: "CORRECT_TEAM_CARD",
} as const;

/**
 * Object representing the different game types.
 * @readonly
 * @enum {string}
 */
export const GAME_TYPE = {
  SINGLE_DEVICE: "SINGLE_DEVICE",
  MULTI_DEVICE: "MULTI_DEVICE",
} as const;

/**
 * Object representing the different game formats.
 * @readonly
 * @enum {string}
 */
export const GAME_FORMAT = {
  QUICK: "QUICK",
  BEST_OF_THREE: "BEST_OF_THREE",
  ROUND_ROBIN: "ROUND_ROBIN",
} as const;

/**
 * Game states
 */
export const GAME_STATE = {
  LOBBY: "LOBBY",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  ABANDONED: "ABANDONED",
  PAUSED: "PAUSED",
} as const;

/**
 * Round states
 */
export const ROUND_STATE = {
  SETUP: "SETUP",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
} as const;

/**
 * Maximum rounds per format
 */
export const MAX_ROUNDS_BY_FORMAT = {
  QUICK: 1,
  BEST_OF_THREE: 3,
  ROUND_ROBIN: 5,
} as const;

/**
 * Turn states
 */
export const TURN_STATUS = {
  ACTIVE: "ACTIVE",
  COMPLETED: "COMPLETED",
} as const;

/**
 * Player role enum
 */

export const PLAYER_ROLE = {
  CODEMASTER: "CODEMASTER",
  CODEBREAKER: "CODEBREAKER",
  SPECTATOR: "SPECTATOR",
  NONE: "NONE",
} as const;
