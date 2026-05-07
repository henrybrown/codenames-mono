import { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { createWebSocketAuthMiddleware, AuthenticatedSocket } from "./websocket-auth.middleware";
import { WebSocketEvent } from "./websocket-events.types";
import { emitServerGameEvent } from "@backend/ai/player/game-event-bus";
import type { AppLogger } from "@backend/shared/logging";

/**
 * WebSocket server configuration
 */
interface WebSocketServerConfig {
  httpServer: HttpServer;
  jwtSecret: string;
  corsOrigins: string[];
  logger?: AppLogger;
}

/**
 * Global WebSocket server instance
 */
let io: SocketIOServer | null = null;

/**
 * Global logger reference for websocket events
 */
let wsLogger: AppLogger | undefined;

/**
 * Initialize WebSocket server with Socket.io
 */
export const initializeWebSocketServer = (config: WebSocketServerConfig): SocketIOServer => {
  const { httpServer, jwtSecret, corsOrigins, logger } = config;
  wsLogger = logger;

  // Create Socket.io server
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: corsOrigins,
      credentials: true,
      methods: ["GET", "POST"],
    },
    // Connection settings
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Apply authentication middleware
  io.use(createWebSocketAuthMiddleware(jwtSecret, logger));

  // Handle connections
  io.on(WebSocketEvent.CONNECTION, (socket: AuthenticatedSocket) => {
    logger?.debug(`websocket_connected: socketId=${socket.id} user=${socket.auth?.username}`);

    // Handle joining game rooms
    socket.on(WebSocketEvent.JOIN_GAME, (gameId: string) => {
      if (!gameId) {
        logger?.warn("websocket_join_game_invalid: missing gameId");
        return;
      }
      const roomName = `game:${gameId}`;
      socket.join(roomName);
      logger?.debug(`websocket_join_game: user=${socket.auth?.username} room=${roomName}`);

      // Emit server-side event so AI can check if it needs to act
      emitServerGameEvent(WebSocketEvent.PLAYER_JOINED, { gameId });
    });

    // Handle leaving game rooms
    socket.on(WebSocketEvent.LEAVE_GAME, (gameId: string) => {
      if (!gameId) {
        logger?.warn("websocket_leave_game_invalid: missing gameId");
        return;
      }
      const roomName = `game:${gameId}`;
      socket.leave(roomName);
      logger?.debug(`websocket_leave_game: user=${socket.auth?.username} room=${roomName}`);
    });

    // Handle disconnection
    socket.on(WebSocketEvent.DISCONNECT, (reason: string) => {
      logger?.debug(`websocket_disconnected: socketId=${socket.id} reason=${reason}`);
    });
  });

  logger?.info("WebSocket server initialized");
  return io;
};

/**
 * Get the global WebSocket server instance
 */
export const getWebSocketServer = (): SocketIOServer => {
  if (!io) {
    throw new Error("WebSocket server not initialized. Call initializeWebSocketServer first.");
  }
  return io;
};

/**
 * Emit event to a specific game room
 */
export const emitToGame = (gameId: string, event: WebSocketEvent, payload: any): void => {
  if (!io) {
    wsLogger?.warn("websocket_emit_skipped: server not initialized");
    return;
  }

  const roomName = `game:${gameId}`;
  io.to(roomName).emit(event, payload);
  wsLogger?.debug(`websocket_emit: event=${event} room=${roomName}`);
};

/**
 * Emit event to all connected clients
 */
export const emitToAll = (event: WebSocketEvent, payload: any): void => {
  if (!io) {
    wsLogger?.warn("websocket_emit_skipped: server not initialized");
    return;
  }

  io.emit(event, payload);
  wsLogger?.debug(`websocket_emit_all: event=${event}`);
};
