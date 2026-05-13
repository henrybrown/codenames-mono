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
 * Service for emitting game-related WebSocket events
 * This provides a clean interface for the rest of the application
 * to trigger real-time updates without knowing WebSocket implementation details
 */
export class GameEventsEmitter {
  /**
   * Emit a player joined event
   */
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

  /**
   * Emit a player left event
   */
  static playerLeft(gameId: string, playerId: string, playerName: string): void {
    const payload: PlayerEventPayload = {
      gameId,
      playerId,
      playerName,
      timestamp: new Date().toISOString(),
    };
    emitToGame(gameId, WebSocketEvent.PLAYER_LEFT, payload);
  }

  /**
   * Emit a player updated event
   */
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

  /**
   * Emit a game started event
   */
  static gameStarted(gameId: string): void {
    const payload: BaseEventPayload = {
      gameId,
      timestamp: new Date().toISOString(),
    };
    emitToGame(gameId, WebSocketEvent.GAME_STARTED, payload);
  }

  /**
   * Emit a round created event
   */
  static roundCreated(gameId: string, roundNumber: number): void {
    const payload: GameplayEventPayload = {
      gameId,
      roundNumber,
      timestamp: new Date().toISOString(),
    };
    emitToGame(gameId, WebSocketEvent.ROUND_CREATED, payload);
  }

  /**
   * Emit a round started event
   */
  static roundStarted(gameId: string, roundNumber: number): void {
    const payload: GameplayEventPayload = {
      gameId,
      roundNumber,
      timestamp: new Date().toISOString(),
    };
    emitToGame(gameId, WebSocketEvent.ROUND_STARTED, payload);
  }

  /**
   * Emit a cards dealt event
   */
  static cardsDealt(gameId: string, roundNumber: number): void {
    const payload: GameplayEventPayload = {
      gameId,
      roundNumber,
      timestamp: new Date().toISOString(),
    };
    emitToGame(gameId, WebSocketEvent.CARDS_DEALT, payload);
  }

  /**
   * Emit a clue given event
   */
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

  /**
   * Emit a guess made event
   */
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

  /**
   * Emit a turn started event
   */
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

  /**
   * Emit a turn ended event
   */
  static turnEnded(gameId: string, roundNumber: number, turnId: string): void {
    const payload: GameplayEventPayload = {
      gameId,
      roundNumber,
      turnId,
      timestamp: new Date().toISOString(),
    };
    emitToGame(gameId, WebSocketEvent.TURN_ENDED, payload);
  }

  /**
   * Emit a round ended event
   */
  static roundEnded(gameId: string, roundNumber: number): void {
    const payload: GameplayEventPayload = {
      gameId,
      roundNumber,
      timestamp: new Date().toISOString(),
    };
    emitToGame(gameId, WebSocketEvent.ROUND_ENDED, payload);
  }

  /**
   * Emit a game ended event
   */
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

  /**
   * Emit an AI pipeline started event
   */
  static aiPipelineStarted(gameId: string, runId: string, pipelineType: string): void {
    const payload: AiPipelineEventPayload = {
      gameId,
      runId,
      pipelineType,
      timestamp: new Date().toISOString(),
    };
    emitToGame(gameId, WebSocketEvent.AI_PIPELINE_STARTED, payload);
  }

  /**
   * Emit an AI pipeline stage event
   */
  static aiPipelineStage(gameId: string, runId: string, stage: string): void {
    const payload: AiPipelineEventPayload = {
      gameId,
      runId,
      stage,
      timestamp: new Date().toISOString(),
    };
    emitToGame(gameId, WebSocketEvent.AI_PIPELINE_STAGE, payload);
  }

  /**
   * Emit an AI pipeline complete event
   */
  static aiPipelineComplete(gameId: string, runId: string): void {
    const payload: AiPipelineEventPayload = {
      gameId,
      runId,
      timestamp: new Date().toISOString(),
    };
    emitToGame(gameId, WebSocketEvent.AI_PIPELINE_COMPLETE, payload);
  }

  /**
   * Emit an AI pipeline failed event
   */
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
