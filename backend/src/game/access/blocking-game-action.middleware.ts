import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";

type LockEntry = {
  action: string;
  startedAt: number;
  timer: ReturnType<typeof setTimeout>;
};

/** In-memory lock map: gameId to active action */
const activeLocks = new Map<string, LockEntry>();

/** Safety timeout to auto-release stuck locks */
const LOCK_TIMEOUT_MS = 30_000;

/**
 * Middleware that enforces per-game mutual exclusion on mutating endpoints.
 * First request acquires the lock. Concurrent requests to the same gameId
 * receive a 409 with the current action name so the client can show
 * a contextual message like "Waiting for a guess to complete..."
 *
 * @param actionName - Human-readable label included in the 409 response
 *
 * @example
 * router.post("/games/:gameId/rounds/:rn/clues", auth, blockingGameAction("give-clue"), controller);
 * router.post("/games/:gameId/rounds/:rn/guesses", auth, blockingGameAction("make-guess"), controller);
 */
export const blockingGameAction = (actionName: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const rawGameId = req.params.gameId;
    const gameId = Array.isArray(rawGameId) ? rawGameId[0] : rawGameId;

    if (!gameId) {
      next();
      return;
    }

    // Reject if another action is in-flight for this game
    const existing = activeLocks.get(gameId);
    if (existing) {
      res.status(409).json({
        success: false,
        error: "action-in-progress",
        message:
          "Another action is already being processed for this game. Please try again.",
        details: {
          currentAction: existing.action,
          startedAt: existing.startedAt,
        },
      });
      return;
    }

    // Acquire the lock
    const release = () => {
      const current = activeLocks.get(gameId);
      // Only release if this is still our lock (guards against double-release)
      if (current && current.startedAt === lock.startedAt) {
        clearTimeout(current.timer);
        activeLocks.delete(gameId);
      }
    };

    const timer = setTimeout(() => {
      // Safety net: release if the handler takes too long
      activeLocks.delete(gameId);
    }, LOCK_TIMEOUT_MS);

    const lock: LockEntry = {
      action: actionName,
      startedAt: Date.now(),
      timer,
    };

    activeLocks.set(gameId, lock);

    // Release when response completes or client disconnects
    res.on("finish", release);
    res.on("close", release);

    next();
  };
};

/**
 * Check if a game currently has an active lock.
 * Useful for AI pipeline pre-checks before attempting a move.
 */
export const isGameLocked = (gameId: string): boolean => {
  return activeLocks.has(gameId);
};

/**
 * Get info about the current lock on a game, or null if unlocked.
 */
export const getGameLockInfo = (
  gameId: string,
): { action: string; startedAt: number; durationMs: number } | null => {
  const lock = activeLocks.get(gameId);
  if (!lock) return null;
  return {
    action: lock.action,
    startedAt: lock.startedAt,
    durationMs: Date.now() - lock.startedAt,
  };
};

export type BlockingGameActionMiddleware = ReturnType<typeof blockingGameAction>;
