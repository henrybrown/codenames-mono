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

export interface BaseEventPayload {
  gameId: string;
  timestamp: string;
}

export interface PlayerEventPayload extends BaseEventPayload {
  playerId?: string;
  playerName?: string;
  teamId?: number;
}

export interface GameplayEventPayload extends BaseEventPayload {
  roundNumber?: number;
  turnId?: string;
  playerId?: string;
}

export interface GameStateEventPayload extends BaseEventPayload {
  gameStatus?: string;
  winningTeamId?: number;
}

export interface AiPipelineEventPayload extends BaseEventPayload {
  runId: string;
  pipelineType?: string;
  stage?: string;
  error?: string;
}

export interface GameMessageEventPayload extends BaseEventPayload {
  messageId: string;
  messageType: string;
  teamId?: number;
}

export type EventPayload =
  | BaseEventPayload
  | PlayerEventPayload
  | GameplayEventPayload
  | GameStateEventPayload
  | AiPipelineEventPayload
  | GameMessageEventPayload;
