/**
 * WebSocket module exports
 * Provides real-time communication for multiplayer game features
 */

export { WebSocketProvider, useWebSocket } from "./websocket-context";
export type { ConnectionStatus } from "./websocket-context";
export { useGameRoom } from "./use-game-room";
export { useWebSocketInvalidation } from "./use-websocket-invalidation";
export { useTurnBoundarySignal } from "./turn-boundary-emitter";
export type { TurnBoundaryDetail } from "./turn-boundary-emitter";
export { WebSocketEvent } from "./websocket-events.types";
export type {
  BaseEventPayload,
  PlayerEventPayload,
  GameplayEventPayload,
  GameStateEventPayload,
  EventPayload,
} from "./websocket-events.types";
