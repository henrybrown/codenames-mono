/**
 * Game access — RBAC, member-presence gates, per-game concurrency lock.
 *
 * All HTTP-time access decisions for routes under /games/:gameId/* live
 * here. Controllers consume the helpers (post-middleware) but never have
 * to think about gates themselves.
 */

export { requireGameRole } from "./require-game-role";
export type { RequireGameRoleDeps } from "./require-game-role";

export { requireGameMember } from "./require-game-member";
export type { RequireGameMemberDeps } from "./require-game-member";

export {
  blockingGameAction,
  isGameLocked,
  getGameLockInfo,
  type BlockingGameActionMiddleware,
} from "./blocking-game-action";

export {
  findPlayerByUserId,
  findPlayerByPublicId,
  findPlayerByActiveRole,
  isUserPlayerInGame,
} from "./helpers";
export type { GamePlayer } from "./types";
