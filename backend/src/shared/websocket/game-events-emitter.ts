import { emitToGame } from "./websocket-server";
import { WebSocketEvent } from "./websocket-events.types";
import type {
  BaseEventPayload,
  PlayerEventPayload,
  GameplayEventPayload,
  GameStateEventPayload,
  AiPipelineEventPayload,
  GameMessageEventPayload,
} from "./websocket-events.types";

/**
 * Static façade over the websocket server for emitting game events.
 *
 * Each method composes the payload for a specific `WebSocketEvent`,
 * stamps it with the current timestamp, and broadcasts it to the
 * `game:<gameId>` room. Centralising emission here keeps payload
 * shapes consistent and hides the underlying transport.
 */
export class GameEventsEmitter {
  static playerJoined(gameId: string, playerId: string, playerName: string, teamId?: number): void {
    const payload: PlayerEventPayload = {
      gameId,
      playerId,
      playerName,
      teamId,
      timestamp: new Date().toISOString(),
    };
    emitToGame(gameId, WebSocketEvent.PLAYER_JOINED, payload);
  }

  static playerLeft(gameId: string, playerId: string, playerName: string): void {
    const payload: PlayerEventPayload = {
      gameId,
      playerId,
      playerName,
      timestamp: new Date().toISOString(),
    };
    emitToGame(gameId, WebSocketEvent.PLAYER_LEFT, payload);
  }

  static playerUpdated(
    gameId: string,
    playerId: string,
    playerName?: string,
    teamId?: number,
  ): void {
    const payload: PlayerEventPayload = {
      gameId,
      playerId,
      playerName,
      teamId,
      timestamp: new Date().toISOString(),
    };
    emitToGame(gameId, WebSocketEvent.PLAYER_UPDATED, payload);
  }

  static gameStarted(gameId: string): void {
    const payload: BaseEventPayload = {
      gameId,
      timestamp: new Date().toISOString(),
    };
    emitToGame(gameId, WebSocketEvent.GAME_STARTED, payload);
  }

  static roundCreated(gameId: string, roundNumber: number): void {
    const payload: GameplayEventPayload = {
      gameId,
      roundNumber,
      timestamp: new Date().toISOString(),
    };
    emitToGame(gameId, WebSocketEvent.ROUND_CREATED, payload);
  }

  static roundStarted(gameId: string, roundNumber: number): void {
    const payload: GameplayEventPayload = {
      gameId,
      roundNumber,
      timestamp: new Date().toISOString(),
    };
    emitToGame(gameId, WebSocketEvent.ROUND_STARTED, payload);
  }

  static cardsDealt(gameId: string, roundNumber: number): void {
    const payload: GameplayEventPayload = {
      gameId,
      roundNumber,
      timestamp: new Date().toISOString(),
    };
    emitToGame(gameId, WebSocketEvent.CARDS_DEALT, payload);
  }

  static clueGiven(gameId: string, roundNumber: number, turnId: string, playerId: string): void {
    const payload: GameplayEventPayload = {
      gameId,
      roundNumber,
      turnId,
      playerId,
      timestamp: new Date().toISOString(),
    };
    emitToGame(gameId, WebSocketEvent.CLUE_GIVEN, payload);
  }

  static guessMade(gameId: string, roundNumber: number, turnId: string, playerId: string): void {
    const payload: GameplayEventPayload = {
      gameId,
      roundNumber,
      turnId,
      playerId,
      timestamp: new Date().toISOString(),
    };
    emitToGame(gameId, WebSocketEvent.GUESS_MADE, payload);
    // Also emit to server-side event bus for AI to listen
  }

  static turnStarted(gameId: string, roundNumber: number, turnId: string, playerId?: string): void {
    const payload: GameplayEventPayload = {
      gameId,
      roundNumber,
      turnId,
      playerId,
      timestamp: new Date().toISOString(),
    };
    emitToGame(gameId, WebSocketEvent.TURN_STARTED, payload);
  }

  static turnEnded(gameId: string, roundNumber: number, turnId: string): void {
    const payload: GameplayEventPayload = {
      gameId,
      roundNumber,
      turnId,
      timestamp: new Date().toISOString(),
    };
    emitToGame(gameId, WebSocketEvent.TURN_ENDED, payload);
  }

  static roundEnded(gameId: string, roundNumber: number): void {
    const payload: GameplayEventPayload = {
      gameId,
      roundNumber,
      timestamp: new Date().toISOString(),
    };
    emitToGame(gameId, WebSocketEvent.ROUND_ENDED, payload);
  }

  static gameEnded(gameId: string, winningTeamId: number | null = null): void {
    const payload: GameStateEventPayload = {
      gameId,
      winningTeamId: winningTeamId ?? undefined,
      timestamp: new Date().toISOString(),
    };
    emitToGame(gameId, WebSocketEvent.GAME_ENDED, payload);
  }

  /**
   * Emit a generic game updated event
   * Use this when you want to trigger a refresh but don't have a specific event type
   */
  static gameUpdated(gameId: string): void {
    const payload: BaseEventPayload = {
      gameId,
      timestamp: new Date().toISOString(),
    };
    emitToGame(gameId, WebSocketEvent.GAME_UPDATED, payload);
  }

  static aiPipelineStarted(gameId: string, runId: string, pipelineType: string): void {
    const payload: AiPipelineEventPayload = {
      gameId,
      runId,
      pipelineType,
      timestamp: new Date().toISOString(),
    };
    emitToGame(gameId, WebSocketEvent.AI_PIPELINE_STARTED, payload);
  }

  static aiPipelineStage(gameId: string, runId: string, stage: string): void {
    const payload: AiPipelineEventPayload = {
      gameId,
      runId,
      stage,
      timestamp: new Date().toISOString(),
    };
    emitToGame(gameId, WebSocketEvent.AI_PIPELINE_STAGE, payload);
  }

  static aiPipelineComplete(gameId: string, runId: string): void {
    const payload: AiPipelineEventPayload = {
      gameId,
      runId,
      timestamp: new Date().toISOString(),
    };
    emitToGame(gameId, WebSocketEvent.AI_PIPELINE_COMPLETE, payload);
  }

  static aiPipelineFailed(gameId: string, runId: string, error: string): void {
    const payload: AiPipelineEventPayload = {
      gameId,
      runId,
      error,
      timestamp: new Date().toISOString(),
    };
    emitToGame(gameId, WebSocketEvent.AI_PIPELINE_FAILED, payload);
  }

  /**
   * Emit a game message created event
   * For team-only messages, only emit to members of that team
   */
  static gameMessageCreated(
    gameId: string,
    messageId: string,
    messageType: string,
    teamId?: number,
  ): void {
    const payload: GameMessageEventPayload = {
      gameId,
      messageId,
      messageType,
      teamId,
      timestamp: new Date().toISOString(),
    };
    emitToGame(gameId, WebSocketEvent.GAME_MESSAGE_CREATED, payload);
  }
}
