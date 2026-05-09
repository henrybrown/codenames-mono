/**
 * resolve-player-context
 *
 * Given an already-loaded GameAggregate plus identity inputs,
 * produce the canonical PlayerContext (or null, or an error).
 *
 * Pure logic, no DB access. The aggregate already contains every
 * player in `aggregate.teams[].players[]`, so we don't need a
 * findPlayerByPublicId repo call here.
 *
 * Three input shapes (mutually exclusive):
 *   - byPlayerId: caller knows the exact player (multi-device).
 *   - byRole:     caller wants the player who's currently fulfilling
 *                 a role on the active turn (single-device).
 *   - byUser:     caller has only userId. In multi-device returns the
 *                 user's only player; in single-device returns null
 *                 (no specific player to identify).
 */

import { GAME_TYPE, type PlayerRole } from "@codenames/shared/types";
import type { GameAggregate, PlayerContext, Player } from "./gameplay-state.types";

export type PlayerContextRequest =
  | { kind: "byPlayerId"; playerId: string; userId: number }
  | { kind: "byRole"; role: PlayerRole; userId: number }
  | { kind: "byUser"; userId: number };

export type PlayerContextResult =
  | { ok: true; playerContext: PlayerContext | null }
  | { ok: false; reason: "player-not-found"; playerId: string }
  | { ok: false; reason: "player-not-owned"; userId: number; playerId: string }
  | { ok: false; reason: "no-active-turn"; gameId: string }
  | { ok: false; reason: "no-player-for-role"; role: PlayerRole; teamName: string };

export type PlayerContextResolver = (
  aggregate: GameAggregate,
  request: PlayerContextRequest,
) => PlayerContextResult;

const toPlayerContext = (player: Player): PlayerContext => ({
  _id: player._id,
  publicId: player.publicId,
  _userId: player._userId,
  _teamId: player._teamId,
  publicName: player.publicName,
  teamName: player.teamName,
  username: player.publicName,
  role: player.role as PlayerRole,
});

const allPlayers = (aggregate: GameAggregate): Player[] =>
  aggregate.teams.flatMap((t) => t.players ?? []);

const resolveByPlayerId = (
  aggregate: GameAggregate,
  req: Extract<PlayerContextRequest, { kind: "byPlayerId" }>,
): PlayerContextResult => {
  // Player comes from the aggregate's own players list, so if find()
  // returns a player it necessarily belongs to this game — no need
  // for the player-not-in-game branch the legacy provider had (that
  // check existed because the legacy code looked up by publicId via
  // a separate repo call that could return players from any game).
  const player = allPlayers(aggregate).find((p) => p.publicId === req.playerId);
  if (!player) {
    return { ok: false, reason: "player-not-found", playerId: req.playerId };
  }
  // Multi-device only: user must own the player.
  if (
    aggregate.game_type === GAME_TYPE.MULTI_DEVICE &&
    player._userId !== req.userId
  ) {
    return {
      ok: false,
      reason: "player-not-owned",
      userId: req.userId,
      playerId: req.playerId,
    };
  }
  return { ok: true, playerContext: toPlayerContext(player) };
};

const resolveByRole = (
  aggregate: GameAggregate,
  req: Extract<PlayerContextRequest, { kind: "byRole" }>,
): PlayerContextResult => {
  const activeTurn = aggregate.currentRound?.turns?.find(
    (t) => t.status === "ACTIVE",
  );
  if (!activeTurn) {
    return { ok: false, reason: "no-active-turn", gameId: aggregate.public_id };
  }

  const roundPlayers = aggregate.currentRound?.players ?? [];
  const matching = roundPlayers.find(
    (p) => p._teamId === activeTurn._teamId && p.role === req.role,
  );
  if (!matching) {
    const teamName =
      aggregate.teams.find((t) => t._id === activeTurn._teamId)?.teamName ?? "unknown";
    return {
      ok: false,
      reason: "no-player-for-role",
      role: req.role,
      teamName,
    };
  }
  return { ok: true, playerContext: toPlayerContext(matching) };
};

const resolveByUser = (
  aggregate: GameAggregate,
  req: Extract<PlayerContextRequest, { kind: "byUser" }>,
): PlayerContextResult => {
  // Multi-device: user has at most one player; return that.
  // Single-device: many possible players for the same user; return null.
  if (aggregate.game_type === GAME_TYPE.MULTI_DEVICE) {
    const userPlayer = allPlayers(aggregate).find((p) => p._userId === req.userId);
    return {
      ok: true,
      playerContext: userPlayer ? toPlayerContext(userPlayer) : null,
    };
  }
  return { ok: true, playerContext: null };
};

export const createPlayerContextResolver = (): PlayerContextResolver =>
  (aggregate, request) => {
    switch (request.kind) {
      case "byPlayerId": return resolveByPlayerId(aggregate, request);
      case "byRole":     return resolveByRole(aggregate, request);
      case "byUser":     return resolveByUser(aggregate, request);
    }
  };
