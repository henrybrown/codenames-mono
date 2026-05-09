/**
 * verify-game-membership
 *
 * Step 1 of a request lifecycle: is this user allowed to access this game?
 *
 * Yes/no answer with structured failure reasons. Does not load the full
 * aggregate; cheap fast-fail before the heavier load step.
 *
 * Special cases:
 *   - LOBBY-status games are accessible by any authenticated user
 *     (multi-device join flow lets users see the lobby before they're
 *     in the players table).
 *   - userId === 0 is the AI/system bypass.
 */

import type {
  GameFinder,
  PublicId,
  InternalId,
} from "@backend/shared/data-access/repositories/games.repository";
import type { PlayerFinderAll } from "@backend/shared/data-access/repositories/players.repository";
import { GAME_STATE } from "@codenames/shared/types";

export type MembershipResult =
  | { ok: true }
  | { ok: false; reason: "game-not-found"; gameId: string }
  | { ok: false; reason: "user-not-in-game"; gameId: string; userId: number };

export type GameMembershipVerifier = (
  gameId: string,
  userId: number,
) => Promise<MembershipResult>;

export type GameMembershipVerifierDeps = {
  getGameById: GameFinder<PublicId>;
  getPlayersByGameId: PlayerFinderAll<InternalId>;
};

export const createGameMembershipVerifier =
  (deps: GameMembershipVerifierDeps): GameMembershipVerifier =>
  async (gameId, userId) => {
    const game = await deps.getGameById(gameId);
    if (!game) return { ok: false, reason: "game-not-found", gameId };

    // LOBBY: any authenticated user can view (multi-device join flow).
    // userId === 0: AI/system bypass.
    if (game.status === GAME_STATE.LOBBY || userId === 0) {
      return { ok: true };
    }

    const players = await deps.getPlayersByGameId(game._id);
    const isMember = players.some((p) => p._userId === userId);
    return isMember
      ? { ok: true }
      : { ok: false, reason: "user-not-in-game", gameId, userId };
  };
