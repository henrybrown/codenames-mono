/**
 * get-gameplay-state
 *
 * The composed read-only request lifecycle:
 *   1. verifyGameMembership — auth check
 *   2. loadGameAggregate    — fetch
 *   3. resolvePlayerContext — identify
 *
 * Most callers want this. Action services that need to interleave a
 * DB mutation between steps compose the underlying building blocks
 * directly.
 */

import type { PlayerRole } from "@codenames/shared/types";
import type { GameAggregate } from "./gameplay-state.types";
import type { GameAggregateLoader } from "./load-game-aggregate";
import type { GameMembershipVerifier } from "./verify-game-membership";
import type { PlayerContextResolver } from "./resolve-player-context";

export type GameplayStateInput =
  | { gameId: string; userId: number }
  | { gameId: string; userId: number; playerId: string }
  | { gameId: string; userId: number; role: PlayerRole };

export type GameplayStateResult =
  | { status: "found"; data: GameAggregate }
  | { status: "game-not-found"; gameId: string }
  | { status: "user-not-in-game"; gameId: string; userId: number }
  | { status: "player-not-found"; playerId: string }
  | { status: "user-not-authorized"; userId: number; playerId: string }
  | { status: "no-active-turn"; gameId: string }
  | { status: "no-player-for-role"; role: PlayerRole; teamName: string };

export type GameplayStateProvider = (
  input: GameplayStateInput,
) => Promise<GameplayStateResult>;

export type GameplayStateProviderDeps = {
  loadAggregate: GameAggregateLoader;
  verifyMembership: GameMembershipVerifier;
  resolvePlayerContext: PlayerContextResolver;
};

export const createGameplayStateProvider =
  (deps: GameplayStateProviderDeps): GameplayStateProvider =>
  async (input) => {
    // 1. Authorise
    const membership = await deps.verifyMembership(input.gameId, input.userId);
    if (!membership.ok) {
      switch (membership.reason) {
        case "game-not-found":
          return { status: "game-not-found", gameId: membership.gameId };
        case "user-not-in-game":
          return {
            status: "user-not-in-game",
            gameId: membership.gameId,
            userId: membership.userId,
          };
      }
    }

    // 2. Load
    const aggregate = await deps.loadAggregate(input.gameId);
    if (!aggregate) {
      return { status: "game-not-found", gameId: input.gameId };
    }

    // 3. Identify
    const ctx = deps.resolvePlayerContext(
      aggregate,
      "playerId" in input
        ? { kind: "byPlayerId", playerId: input.playerId, userId: input.userId }
        : "role" in input
        ? { kind: "byRole", role: input.role, userId: input.userId }
        : { kind: "byUser", userId: input.userId },
    );
    if (!ctx.ok) {
      switch (ctx.reason) {
        case "player-not-found":
          return { status: "player-not-found", playerId: ctx.playerId };
        case "player-not-owned":
          return {
            status: "user-not-authorized",
            userId: ctx.userId,
            playerId: ctx.playerId,
          };
        case "no-active-turn":
          return { status: "no-active-turn", gameId: ctx.gameId };
        case "no-player-for-role":
          return {
            status: "no-player-for-role",
            role: ctx.role,
            teamName: ctx.teamName,
          };
      }
    }

    return {
      status: "found",
      data: { ...aggregate, playerContext: ctx.playerContext },
    };
  };
