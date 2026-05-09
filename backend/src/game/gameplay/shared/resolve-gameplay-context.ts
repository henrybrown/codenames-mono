/**
 * Shared controller helper for resolving gameplay context.
 *
 * Three thin paths over the unified getGameplayState provider:
 *   - fromPlayerId: multi-device — passes playerId
 *   - fromRole:     single-device — passes role; provider resolves to a player
 *                   on the active turn
 *   - fromUser:     mode-agnostic — no specific player concern
 */

import type { GameAggregate } from "@backend/game/gameplay/state/gameplay-state.types";
import type {
  GameplayStateProvider,
  GameplayStateResult,
} from "@backend/game/gameplay/state/get-gameplay-state";
import type { PlayerRole } from "@codenames/shared/types";

export type ContextError =
  | { code: "game-not-found"; gameId: string }
  | { code: "user-not-in-game"; gameId: string; userId: number }
  | { code: "player-not-found"; playerId: string }
  | { code: "player-not-owned"; userId: number; playerId: string }
  | { code: "no-active-turn"; gameId: string }
  | { code: "no-player-for-role"; role: string; teamName: string };

export type ContextResult =
  | { success: true; gameState: GameAggregate }
  | { success: false; error: ContextError };

export type ResolveGameplayContextDeps = {
  getGameplayState: GameplayStateProvider;
};

const toContextResult = (result: GameplayStateResult): ContextResult => {
  switch (result.status) {
    case "found":
      return { success: true, gameState: result.data };
    case "game-not-found":
      return { success: false, error: { code: "game-not-found", gameId: result.gameId } };
    case "user-not-in-game":
      return {
        success: false,
        error: { code: "user-not-in-game", gameId: result.gameId, userId: result.userId },
      };
    case "player-not-found":
      return { success: false, error: { code: "player-not-found", playerId: result.playerId } };
    case "user-not-authorized":
      return {
        success: false,
        error: { code: "player-not-owned", userId: result.userId, playerId: result.playerId },
      };
    case "no-active-turn":
      return { success: false, error: { code: "no-active-turn", gameId: result.gameId } };
    case "no-player-for-role":
      return {
        success: false,
        error: {
          code: "no-player-for-role",
          role: result.role,
          teamName: result.teamName,
        },
      };
  }
};

export const createResolveGameplayContext = (deps: ResolveGameplayContextDeps) => ({
  fromPlayerId: async (
    gameId: string,
    userId: number,
    playerId: string,
  ): Promise<ContextResult> =>
    toContextResult(await deps.getGameplayState({ gameId, userId, playerId })),

  fromRole: async (
    gameId: string,
    userId: number,
    role: PlayerRole,
  ): Promise<ContextResult> =>
    toContextResult(await deps.getGameplayState({ gameId, userId, role })),

  fromUser: async (
    gameId: string,
    userId: number,
  ): Promise<ContextResult> =>
    toContextResult(await deps.getGameplayState({ gameId, userId })),
});

/**
 * Maps context errors to HTTP status codes and response bodies.
 */
export const contextErrorToHttp = (
  error: ContextError,
): { status: number; body: { error: string; details?: Record<string, unknown> } } => {
  switch (error.code) {
    case "game-not-found":
      return { status: 404, body: { error: "Game not found", details: { gameId: error.gameId } } };
    case "user-not-in-game":
      return { status: 403, body: { error: "User is not a player in this game" } };
    case "player-not-found":
      return {
        status: 404,
        body: { error: "Player not found", details: { playerId: error.playerId } },
      };
    case "player-not-owned":
      return { status: 403, body: { error: "User does not own this player" } };
    case "no-active-turn":
      return { status: 409, body: { error: "No active turn" } };
    case "no-player-for-role":
      return {
        status: 404,
        body: { error: `No ${error.role} found on team ${error.teamName}` },
      };
  }
};

export type ResolveGameplayContext = ReturnType<typeof createResolveGameplayContext>;
