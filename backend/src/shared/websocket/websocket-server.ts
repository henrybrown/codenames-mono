import { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { createWebSocketAuthMiddleware, AuthenticatedSocket } from "./websocket-auth.middleware";
import { WebSocketEvent } from "./websocket-events.types";
import { emitServerGameEvent } from "@backend/ai/player/game-event-bus";
import type { AppLogger } from "@backend/shared/logging";

interface WebSocketServerConfig {
  httpServer: HttpServer;
  jwtSecret: string;
  corsOrigins: string[];
  logger?: AppLogger;
}

let io: SocketIOServer | null = null;

let wsLogger: AppLogger | undefined;

export const initializeWebSocketServer = (config: WebSocketServerConfig): SocketIOServer => {
  const { httpServer, jwtSecret, corsOrigins, logger } = config;
  wsLogger = logger;

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: corsOrigins,
      credentials: true,
      methods: ["GET", "POST"],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.use(createWebSocketAuthMiddleware(jwtSecret, logger));

  io.on(WebSocketEvent.CONNECTION, (socket: AuthenticatedSocket) => {
    logger?.debug(`websocket_connected: socketId=${socket.id} user=${socket.auth?.username}`);

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

    socket.on(WebSocketEvent.LEAVE_GAME, (gameId: string) => {
      if (!gameId) {
        logger?.warn("websocket_leave_game_invalid: missing gameId");
        return;
      }
      const roomName = `game:${gameId}`;
      socket.leave(roomName);
      logger?.debug(`websocket_leave_game: user=${socket.auth?.username} room=${roomName}`);
    });

    socket.on(WebSocketEvent.DISCONNECT, (reason: string) => {
      logger?.debug(`websocket_disconnected: socketId=${socket.id} reason=${reason}`);
    });
  });

  logger?.info("WebSocket server initialized");
  return io;
};

export const getWebSocketServer = (): SocketIOServer => {
  if (!io) {
    throw new Error("WebSocket server not initialized. Call initializeWebSocketServer first.");
  }
  return io;
};

export const emitToGame = (gameId: string, event: WebSocketEvent, payload: any): void => {
  if (!io) {
    wsLogger?.warn("websocket_emit_skipped: server not initialized");
    return;
  }

  const roomName = `game:${gameId}`;
  io.to(roomName).emit(event, payload);
  wsLogger?.debug(`websocket_emit: event=${event} room=${roomName}`);
};

export const emitToAll = (event: WebSocketEvent, payload: any): void => {
  if (!io) {
    wsLogger?.warn("websocket_emit_skipped: server not initialized");
    return;
  }

  io.emit(event, payload);
  wsLogger?.debug(`websocket_emit_all: event=${event}`);
};
