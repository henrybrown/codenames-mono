import { EventEmitter } from "events";
import { WebSocketEvent } from "@backend/shared/websocket/websocket-events.types";
import type {
  GameplayEventPayload,
} from "@backend/shared/websocket/websocket-events.types";

type GameEventListeners = {
  [WebSocketEvent.CLUE_GIVEN]: (payload: GameplayEventPayload) => void | Promise<void>;
  [WebSocketEvent.GUESS_MADE]: (payload: GameplayEventPayload) => void | Promise<void>;
  [WebSocketEvent.TURN_ENDED]: (payload: GameplayEventPayload) => void | Promise<void>;
  [WebSocketEvent.ROUND_STARTED]: (payload: GameplayEventPayload) => void | Promise<void>;
  [WebSocketEvent.GAME_STARTED]: (payload: { gameId: string }) => void | Promise<void>;
  [WebSocketEvent.PLAYER_JOINED]: (payload: { gameId: string }) => void | Promise<void>;
};

class GameEventBus extends EventEmitter {
  emitGameEvent<K extends keyof GameEventListeners>(
    event: K,
    payload: Parameters<GameEventListeners[K]>[0],
  ): void {
    this.emit(event, payload);
  }

  onGameEvent<K extends keyof GameEventListeners>(
    event: K,
    listener: GameEventListeners[K],
  ): void {
    this.on(event, listener);
  }

  onceGameEvent<K extends keyof GameEventListeners>(
    event: K,
    listener: GameEventListeners[K],
  ): void {
    this.once(event, listener);
  }

  offGameEvent<K extends keyof GameEventListeners>(
    event: K,
    listener: GameEventListeners[K],
  ): void {
    this.off(event, listener);
  }
}

/**
 * Process-wide singleton event bus.
 *
 * Single instance because event listeners are registered globally — adding
 * multiple instances would silently fragment subscription.
 */
export const gameEventBus = new GameEventBus();

/**
 * Pre-bound `emitGameEvent` for terse use from anywhere holding a reference
 * to this module.
 */
export const emitServerGameEvent = gameEventBus.emitGameEvent.bind(gameEventBus);
