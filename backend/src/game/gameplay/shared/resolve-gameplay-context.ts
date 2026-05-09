/**
 * Shared controller helper for resolving gameplay context.
 * Handles the auth boundary and identity resolution before services are called.
 *
 * Three resolution paths:
 *  - fromPlayerId: multi-device — delegates to the auth-aware GameplayStateProvider
 *  - fromRole:     single-device — loads via GameDataLoader, resolves role → player
 *  - fromUser:     mode-agnostic — verifies user is in the game, returns gameState
 *                  with `playerContext: null`. Used by endpoints that don't act as
 *                  a specific player (e.g. start-turn, which is called between
 *                  turns when there is no active turn yet).
 * 
 * todo: review/clean this file
 */

import type { GameplayStateProvider } from "@backend/game/gameplay/state/gameplay-state.provider";
import type { GameDataLoader } from "@backend/game/gameplay/state/load-game-aggregate";
import type { GameAggregate } from "@backend/game/gameplay/state/gameplay-state.types";
import { PLAYER_ROLE } from "@codenames/shared/types";

export type ContextError =
  | { code: "game-not-found"; gameId: string }
  | { code: "user-not-in-game"; gameId: string; userId: number }
  | { code: "player-not-found"; playerId: string }
  | { code: "player-not-in-game"; playerId: string; gameId: string }
  | { code: "player-not-owned"; userId: number; playerId: string }
  | { code: "no-active-turn"; gameId: string }
  | { code: "no-player-for-role"; role: string; teamName: string };

export type ContextResult =
  | { success: true; gameState: GameAggregate }
  | { success: false; error: ContextError };

export type ResolveGameplayContextDeps = {
  getGameState: GameplayStateProvider;
  loadGameData: GameDataLoader;
};

export const createResolveGameplayContext = (deps: ResolveGameplayContextDeps) => {
  const { getGameState, loadGameData } = deps;

  /**
   * Multi-device path: delegates to the auth-aware provider.
   */
  const fromPlayerId = async (
    gameId: string,
    userId: number,
    playerId: string,
  ): Promise<ContextResult> => {
    const result = await getGameState(gameId, userId, playerId);

    switch (result.status) {
      case "found":
        return { success: true, gameState: result.data };
      case "game-not-found":
        return { success: false, error: { code: "game-not-found", gameId } };
      case "user-not-player":
        return { success: false, error: { code: "user-not-in-game", gameId, userId } };
      case "player-not-found":
        return { success: false, error: { code: "player-not-found", playerId } };
      case "player-not-in-game":
        return { success: false, error: { code: "player-not-in-game", playerId, gameId } };
      case "user-not-authorized":
        return { success: false, error: { code: "player-not-owned", userId, playerId } };
    }
  };

  /**
   * Single-device path: load game data (no auth), resolve role to player.
   */
  const fromRole = async (
    gameId: string,
    userId: number,
    role: "CODEMASTER" | "CODEBREAKER",
  ): Promise<ContextResult> => {
    const gameState = await loadGameData(gameId);
    if (!gameState) {
      return { success: false, error: { code: "game-not-found", gameId } };
    }

    // Verify userId is a player in this game
    const allPlayers = gameState.teams.flatMap((t) => t.players ?? []);
    const userIsPlayer = allPlayers.some((p) => p._userId === userId);
    if (!userIsPlayer) {
      return { success: false, error: { code: "user-not-in-game", gameId, userId } };
    }

    // Find the active turn to determine which team
    const activeTurn = gameState.currentRound?.turns?.find((t) => t.status === "ACTIVE");
    if (!activeTurn) {
      return { success: false, error: { code: "no-active-turn", gameId } };
    }

    // Find the player with the requested role on the active turn's team
    const roundPlayers = gameState.currentRound?.players ?? [];
    const matchingPlayer = roundPlayers.find(
      (p) => p._teamId === activeTurn._teamId && p.role === role,
    );

    if (!matchingPlayer) {
      const teamName = gameState.teams.find((t) => t._id === activeTurn._teamId)?.teamName ?? "unknown";
      return {
        success: false,
        error: { code: "no-player-for-role", role, teamName },
      };
    }

    // Set the resolved player as playerContext
    return {
      success: true,
      gameState: {
        ...gameState,
        playerContext: {
          _id: matchingPlayer._id,
          publicId: matchingPlayer.publicId,
          _userId: matchingPlayer._userId,
          _teamId: matchingPlayer._teamId,
          teamName: matchingPlayer.teamName,
          publicName: matchingPlayer.publicName,
          role: matchingPlayer.role as typeof PLAYER_ROLE.CODEMASTER | typeof PLAYER_ROLE.CODEBREAKER,
        },
      },
    };
  };

  /**
   * Mode-agnostic path: verify user is in the game; no specific player context.
   * Used for endpoints that operate on the game as a whole (start-turn) where
   * we cannot — and need not — resolve a player from an active turn.
   */
  const fromUser = async (
    gameId: string,
    userId: number,
  ): Promise<ContextResult> => {
    const gameState = await loadGameData(gameId);
    if (!gameState) {
      return { success: false, error: { code: "game-not-found", gameId } };
    }

    const allPlayers = gameState.teams.flatMap((t) => t.players ?? []);
    const userIsPlayer = allPlayers.some((p) => p._userId === userId);
    if (!userIsPlayer) {
      return { success: false, error: { code: "user-not-in-game", gameId, userId } };
    }

    return { success: true, gameState: { ...gameState, playerContext: null } };
  };

  return { fromPlayerId, fromRole, fromUser };
};

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
      return { status: 404, body: { error: "Player not found", details: { playerId: error.playerId } } };
    case "player-not-in-game":
      return { status: 400, body: { error: "Player is not in this game" } };
    case "player-not-owned":
      return { status: 403, body: { error: "User does not own this player" } };
    case "no-active-turn":
      return { status: 409, body: { error: "No active turn" } };
    case "no-player-for-role":
      return { status: 404, body: { error: `No ${error.role} found on team ${error.teamName}` } };
  }
};

export type ResolveGameplayContext = ReturnType<typeof createResolveGameplayContext>;
