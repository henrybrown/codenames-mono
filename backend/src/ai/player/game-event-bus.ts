/**
 * Server-side event bus for game events
 * Allows services to listen to game events and react
 */

import { EventEmitter } from "events";
import { WebSocketEvent } from "@backend/shared/websocket/websocket-events.types";
import type {
  GameplayEventPayload,
} from "@backend/shared/websocket/websocket-events.types";

/**
 * Type-safe event listener signatures
 */
type GameEventListeners = {
  [WebSocketEvent.CLUE_GIVEN]: (payload: GameplayEventPayload) => void | Promise<void>;
  [WebSocketEvent.GUESS_MADE]: (payload: GameplayEventPayload) => void | Promise<void>;
  [WebSocketEvent.TURN_ENDED]: (payload: GameplayEventPayload) => void | Promise<void>;
  [WebSocketEvent.ROUND_STARTED]: (payload: GameplayEventPayload) => void | Promise<void>;
  [WebSocketEvent.GAME_STARTED]: (payload: { gameId: string }) => void | Promise<void>;
  [WebSocketEvent.PLAYER_JOINED]: (payload: { gameId: string }) => void | Promise<void>;
};

/**
 * Global game event bus
 */
class GameEventBus extends EventEmitter {
  /**
   * Type-safe event emission
   */
  emitGameEvent<K extends keyof GameEventListeners>(
    event: K,
    payload: Parameters<GameEventListeners[K]>[0],
  ): void {
    this.emit(event, payload);
  }

  /**
   * Type-safe event listening
   */
  onGameEvent<K extends keyof GameEventListeners>(
    event: K,
    listener: GameEventListeners[K],
  ): void {
    this.on(event, listener);
  }

  /**
   * Type-safe one-time event listening
   */
  onceGameEvent<K extends keyof GameEventListeners>(
    event: K,
    listener: GameEventListeners[K],
  ): void {
    this.once(event, listener);
  }

  /**
   * Remove a specific listener
   */
  offGameEvent<K extends keyof GameEventListeners>(
    event: K,
    listener: GameEventListeners[K],
  ): void {
    this.off(event, listener);
  }
}

/**
 * Singleton instance
 */
export const gameEventBus = new GameEventBus();

/**
 * Helper to emit events from anywhere in the codebase
 */
export const emitServerGameEvent = gameEventBus.emitGameEvent.bind(gameEventBus);
