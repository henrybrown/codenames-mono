/** Canonical names for every event emitted over the game socket. */
export enum WebSocketEvent {
  // Connection events
  CONNECTION = "connection",
  DISCONNECT = "disconnect",

  // Room events
  JOIN_GAME = "join_game",
  LEAVE_GAME = "leave_game",

  // Lobby events
  PLAYER_JOINED = "player_joined",
  PLAYER_LEFT = "player_left",
  PLAYER_UPDATED = "player_updated",
  GAME_STARTED = "game_started",

  // Round events
  ROUND_CREATED = "round_created",
  ROUND_STARTED = "round_started",
  CARDS_DEALT = "cards_dealt",
  ROUND_ENDED = "round_ended",

  // Turn events
  TURN_STARTED = "turn_started",
  CLUE_GIVEN = "clue_given",
  GUESS_MADE = "guess_made",
  TURN_ENDED = "turn_ended",

  // Game events
  GAME_ENDED = "game_ended",
  GAME_UPDATED = "game_updated",

  // AI Pipeline events
  AI_PIPELINE_STARTED = "ai_pipeline_started",
  AI_PIPELINE_STAGE = "ai_pipeline_stage",
  AI_PIPELINE_COMPLETE = "ai_pipeline_complete",
  AI_PIPELINE_FAILED = "ai_pipeline_failed",

  // Message events
  GAME_MESSAGE_CREATED = "game_message_created",
}

/** Common fields stamped on every event — identifies the game and emission time. */
export interface BaseEventPayload {
  gameId: string;
  timestamp: string;
}

/** Event payload for lobby player-membership changes. */
export interface PlayerEventPayload extends BaseEventPayload {
  playerId?: string;
  playerName?: string;
  teamId?: number;
}

/** Event payload for in-game turn/round progression. */
export interface GameplayEventPayload extends BaseEventPayload {
  roundNumber?: number;
  turnId?: string;
  playerId?: string;
}

/** Event payload for whole-game lifecycle transitions. */
export interface GameStateEventPayload extends BaseEventPayload {
  gameStatus?: string;
  winningTeamId?: number;
}

/** Event payload for AI pipeline lifecycle notifications. */
export interface AiPipelineEventPayload extends BaseEventPayload {
  runId: string;
  pipelineType?: string;
  stage?: string;
  error?: string;
}

/** Event payload for chat / game-message creation. */
export interface GameMessageEventPayload extends BaseEventPayload {
  messageId: string;
  messageType: string;
  teamId?: number;
}

/** Union of every payload shape that may be emitted over the socket. */
export type EventPayload =
  | BaseEventPayload
  | PlayerEventPayload
  | GameplayEventPayload
  | GameStateEventPayload
  | AiPipelineEventPayload
  | GameMessageEventPayload;
