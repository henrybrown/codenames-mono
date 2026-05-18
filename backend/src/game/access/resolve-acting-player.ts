/**
 * Resolve the acting player for a turn action.
 *
 * Turn controllers must produce a `GamePlayer` to attribute the action to
 * before calling the service. The strategy differs by game type:
 *
 *  - Multi-device: the JWT identifies the user → look up their player record.
 *  - Single-device: there's no single authenticated player, so the caller
 *    passes either the active role (clue/guess/end-turn) or a specific
 *    public id (start-turn, where no turn is yet active).
 *
 * These thin wrappers exist so controllers can name *why* they're picking
 * a player rather than just calling the underlying `findPlayerBy*` helper.
 */

import type { GameAggregate } from "@backend/game/state/types";
import type { GamePlayer } from "./types";
import type { PlayerRole } from "@codenames/shared/types";
import {
  findPlayerByActiveRole,
  findPlayerByPublicId,
  findPlayerByUserId,
} from "@backend/game/state/helpers";

/**
 * Resolves the player on the active turn whose role matches the supplied one.
 *
 * Returns `null` if no turn is active or no player on the active turn holds
 * the role; the absence is a domain condition, not an error.
 */
export const resolveActingPlayerForRole = (
  aggregate: GameAggregate,
  role: PlayerRole,
): GamePlayer | null => findPlayerByActiveRole(aggregate, role);

/**
 * Resolves the player record belonging to the given user.
 *
 * Returns `null` when the user has no player in this game.
 */
export const resolveActingPlayerForUser = (
  aggregate: GameAggregate,
  userId: number,
): GamePlayer | null => findPlayerByUserId(aggregate, userId);

/**
 * Resolves a player by their public UUID, regardless of turn state.
 *
 * Returns `null` when no player in the aggregate has that public id.
 */
export const resolveActingPlayerByPublicId = (
  aggregate: GameAggregate,
  publicId: string,
): GamePlayer | null => findPlayerByPublicId(aggregate, publicId);
