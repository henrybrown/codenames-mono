import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "./websocket-context";
import { WebSocketEvent, EventPayload } from "./websocket-events.types";
import { emitTurnBoundary } from "./turn-boundary-emitter";

// ── Event categories ──

const GAME_EVENTS = [
  /** Lobby events */
  WebSocketEvent.PLAYER_JOINED,
  WebSocketEvent.PLAYER_LEFT,
  WebSocketEvent.PLAYER_UPDATED,
  WebSocketEvent.GAME_STARTED,
  /** Round events */
  WebSocketEvent.ROUND_CREATED,
  WebSocketEvent.ROUND_STARTED,
  WebSocketEvent.CARDS_DEALT,
  WebSocketEvent.ROUND_ENDED,
  /** Turn events */
  WebSocketEvent.TURN_STARTED,
  WebSocketEvent.CLUE_GIVEN,
  WebSocketEvent.GUESS_MADE,
  WebSocketEvent.TURN_ENDED,
  /** Game events */
  WebSocketEvent.GAME_ENDED,
  WebSocketEvent.GAME_UPDATED,
] as const;

const AI_EVENTS = [
  WebSocketEvent.AI_PIPELINE_STARTED,
  WebSocketEvent.AI_PIPELINE_STAGE,
  WebSocketEvent.AI_PIPELINE_COMPLETE,
  WebSocketEvent.AI_PIPELINE_FAILED,
] as const;

const CHAT_EVENTS = [
  WebSocketEvent.GAME_MESSAGE_CREATED,
] as const;

const COALESCE_WINDOW_MS = 80;

/**
 * Hook to handle WebSocket events and invalidate React Query cache.
 *
 * Game events are coalesced — multiple events within an 80ms window
 * collapse into a single invalidation call.
 * AI and chat events use targeted invalidation (specific query keys only).
 *
 * @param gameId - The game ID to listen for events on (null to not listen)
 */
export const useWebSocketInvalidation = (gameId: string | null): void => {
  const { socket, isConnected } = useWebSocket();
  const queryClient = useQueryClient();

  // ── Coalescing state for game events ──
  const pendingGameEvents = useRef(new Set<string>());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    const events = Array.from(pendingGameEvents.current);
    pendingGameEvents.current.clear();
    flushTimer.current = null;

    console.debug(`[WS] Flushing ${events.length} game events:`, events);
    queryClient.invalidateQueries();

    // ── Turn boundary signal ──
    const hasTurnEnd = events.includes(WebSocketEvent.TURN_ENDED);
    const hasTurnStart = events.includes(WebSocketEvent.TURN_STARTED);
    const hasRoundEnd = events.includes(WebSocketEvent.ROUND_ENDED);

    if (hasTurnEnd || hasTurnStart) {
      emitTurnBoundary({ events, hasTurnEnd, hasTurnStart, hasRoundEnd });
    }
  }, [queryClient]);

  const refreshGameState = useCallback((eventType: string) => {
    pendingGameEvents.current.add(eventType);
    if (!flushTimer.current) {
      flushTimer.current = setTimeout(flush, COALESCE_WINDOW_MS);
    }
  }, [flush]);

  useEffect(() => {
    if (!socket || !isConnected || !gameId) return;

    // ── Game events → coalesced refreshGameState ──
    const gameHandlers = GAME_EVENTS.map((event) => {
      const handler = (payload: EventPayload) => {
        console.debug(`[WS] Game event: ${event}`, payload);
        refreshGameState(event);
      };
      socket.on(event, handler);
      return { event, handler };
    });

    // ── AI events → targeted AI status invalidation ──
    const aiHandlers = AI_EVENTS.map((event) => {
      const handler = (payload: EventPayload) => {
        console.debug(`[WS] AI event: ${event}`, payload);
        queryClient.invalidateQueries({
          queryKey: ["game", gameId, "ai", "status"],
        });
      };
      socket.on(event, handler);
      return { event, handler };
    });

    // ── Chat events → targeted messages invalidation ──
    const chatHandlers = CHAT_EVENTS.map((event) => {
      const handler = (payload: EventPayload) => {
        console.debug(`[WS] Chat event: ${event}`, payload);
        queryClient.invalidateQueries({
          queryKey: ["game", gameId, "messages"],
        });
      };
      socket.on(event, handler);
      return { event, handler };
    });

    const allHandlers = [...gameHandlers, ...aiHandlers, ...chatHandlers];

    return () => {
      allHandlers.forEach(({ event, handler }) => socket.off(event, handler));
      if (flushTimer.current) {
        clearTimeout(flushTimer.current);
        flushTimer.current = null;
      }
      pendingGameEvents.current.clear();
    };
  }, [socket, isConnected, gameId, queryClient, refreshGameState]);
};
