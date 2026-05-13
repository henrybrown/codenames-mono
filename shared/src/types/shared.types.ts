import {
  CODEBREAKER_OUTCOME,
  GAME_TYPE,
  GAME_FORMAT,
  ROUND_STATE,
  GAME_STATE,
  PLAYER_ROLE,
  TURN_STATUS,
} from "./shared.constants";

export type TurnOutcome =
  (typeof CODEBREAKER_OUTCOME)[keyof typeof CODEBREAKER_OUTCOME];
export type GameType = (typeof GAME_TYPE)[keyof typeof GAME_TYPE];
export type GameFormat = (typeof GAME_FORMAT)[keyof typeof GAME_FORMAT];

export type GameState = (typeof GAME_STATE)[keyof typeof GAME_STATE];
export type RoundState = (typeof ROUND_STATE)[keyof typeof ROUND_STATE];

export type PlayerRole = (typeof PLAYER_ROLE)[keyof typeof PLAYER_ROLE];
export type TurnStatus = (typeof TURN_STATUS)[keyof typeof TURN_STATUS];
