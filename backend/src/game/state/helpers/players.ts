/**
 * Pure helpers for finding a player record inside a loaded GameAggregate.
 *
 * No async, no DB access — all inputs are values, all outputs are values.
 */

import { type PlayerRole } from "@codenames/shared/types";
import type { GameAggregate } from "../types";
import type { GamePlayer } from "@backend/game/access/types";

const allGamePlayers = (aggregate: GameAggregate): GamePlayer[] =>
  aggregate.teams.flatMap((team) =>
    (team.players ?? []).map((p) => ({
      _id: p._id,
      publicId: p.publicId,
      _userId: p._userId,
      _teamId: p._teamId,
      publicName: p.publicName,
      teamName: p.teamName,
      role: p.role as PlayerRole,
    })),
  );

/** Find the user's player in the game, or null if not a player. */
export const findPlayerByUserId = (
  aggregate: GameAggregate,
  userId: number,
): GamePlayer | null =>
  allGamePlayers(aggregate).find((p) => p._userId === userId) ?? null;

/** Find a player by their public id, or null if not found. */
export const findPlayerByPublicId = (
  aggregate: GameAggregate,
  publicId: string,
): GamePlayer | null =>
  allGamePlayers(aggregate).find((p) => p.publicId === publicId) ?? null;

/**
 * Find the player on the active turn's team who holds the given role.
 *
 * Returns `null` when there's no active turn or no matching player on the
 * active team — both treated as "no actor" rather than an error.
 */
export const findPlayerByActiveRole = (
  aggregate: GameAggregate,
  role: PlayerRole,
): GamePlayer | null => {
  const activeTurn = aggregate.currentRound?.turns?.find(
    (t) => t.status === "ACTIVE",
  );
  if (!activeTurn) return null;
  const roundPlayers = aggregate.currentRound?.players ?? [];
  const matching = roundPlayers.find(
    (p) => p._teamId === activeTurn._teamId && p.role === role,
  );
  if (!matching) return null;
  return {
    _id: matching._id,
    publicId: matching.publicId,
    _userId: matching._userId,
    _teamId: matching._teamId,
    publicName: matching.publicName,
    teamName: matching.teamName,
    role: matching.role as PlayerRole,
  };
};

/** Convenience: is this user a member of this game? */
export const isUserPlayerInGame = (
  aggregate: GameAggregate,
  userId: number,
): boolean => findPlayerByUserId(aggregate, userId) !== null;
