/**
 * Game access — RBAC, member-presence gates, per-game concurrency lock.
 *
 * All HTTP-time access decisions for routes under /games/:gameId/* live
 * here. Controllers consume the helpers (post-middleware) but never have
 * to think about gates themselves.
 */

export { requireGameRole } from "./require-game-role.middleware";
export type { RequireGameRoleDeps } from "./require-game-role.middleware";

export { requireGamePlayer as requireGameMember } from "./require-game-player.middleware";
export type { RequireGamePlayerDeps as RequireGameMemberDeps } from "./require-game-player.middleware";

export {
  blockingGameAction,
  isGameLocked,
  getGameLockInfo,
  type BlockingGameActionMiddleware,
} from "./blocking-game-action.middleware";

export {
  findPlayerByUserId,
  findPlayerByPublicId,
  findPlayerByActiveRole,
  isUserPlayerInGame,
} from "@backend/game/state/helpers";
export {
  resolveActingPlayerForRole,
  resolveActingPlayerForUser,
  resolveActingPlayerByPublicId,
} from "./resolve-acting-player";
export type { GamePlayer } from "./types";
