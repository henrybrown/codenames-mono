/**
 * Shared skeleton for clue/guess/end-turn controllers. Each runs the
 * same sequence:
 *
 *   1. Parse params + auth (gameId, roundNumber, userId).
 *   2. Load the game aggregate (404 if missing).
 *   3. Check the round number matches the current round (409 if not).
 *   4. Resolve the acting player + parse the body — strategy varies by
 *      game type, so the caller hands in a `resolvePlayer` callback.
 *   5. Run the per-endpoint handler with the `TurnContext` and body.
 *   6. Shape the response uniformly via sendSuccess/sendError. Unexpected
 *      errors flow to `next(error)` so the global error handler can
 *      attach dev-mode details — turn controllers previously swallowed
 *      these with a generic 500.
 *
 * Service results follow the target branch's `{success: false; message}`
 * shape, surfaced over HTTP as 400 by default (the turn services don't
 * distinguish notFound/conflict variants today).
 */

import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";
import { z } from "zod";
import type { GameAggregate } from "@backend/game/state/types";
import type { GameAggregateLoader } from "@backend/game/state/load-game-aggregate";
import type { GamePlayer } from "@backend/game/access";
import type { AppLogger } from "@backend/shared/logging";
import {
  endpointLogger,
  sendError,
  sendSuccess,
} from "@backend/shared/http-middleware/controller-helpers";

const paramsSchema = z.object({
  gameId: z.string().min(1),
  roundNumber: z.string().transform(Number).refine((n) => n > 0),
});

const authSchema = z.object({
  userId: z.number().int().positive(),
});

export type TurnContext = {
  gameId: string;
  roundNumber: number;
  userId: number;
  aggregate: GameAggregate;
  playerContext: GamePlayer;
};

/**
 * Result of `resolvePlayer`. On success the resolver returns the player
 * plus a typed body (already validated). On failure it returns the HTTP
 * status + error message to send back.
 */
export type ResolvePlayerResult<TBody> =
  | { ok: true; player: GamePlayer; body: TBody }
  | { ok: false; status: number; error: string };

export type ResolvePlayer<TBody> = (
  req: Request,
  aggregate: GameAggregate,
  userId: number,
) => ResolvePlayerResult<TBody> | Promise<ResolvePlayerResult<TBody>>;

/**
 * Handler return shape. Service-level failures surface as 400 with the
 * service's message; unexpected throws flow to `next(error)`.
 */
export type HandlerResult<TData> =
  | { ok: true; status?: number; data: TData }
  | { ok: false; status: number; error: string };

export type TurnHandler<TBody, TData> = (
  ctx: TurnContext,
  body: TBody,
) => Promise<HandlerResult<TData>>;

export type WithTurnContextDeps = {
  logger: AppLogger;
  loadGameAggregate: GameAggregateLoader;
};

/**
 * Build a turn controller from a body/player resolver plus a handler.
 *
 *   const controller = withTurnContext(deps)(
 *     "POST /clues",
 *     resolveCluePlayer,
 *     async (ctx, body) => { ... },
 *   );
 */
export const withTurnContext =
  (deps: WithTurnContextDeps) =>
  <TBody, TData>(
    endpoint: string,
    resolvePlayer: ResolvePlayer<TBody>,
    handle: TurnHandler<TBody, TData>,
    successStatus = 200,
  ) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const log = endpointLogger(deps.logger, endpoint);
    try {
      const paramsResult = paramsSchema.safeParse(req.params);
      const authResult = authSchema.safeParse(req.auth);
      if (!paramsResult.success || !authResult.success) {
        sendError(res, 400, "Invalid request parameters");
        return;
      }
      const { gameId, roundNumber } = paramsResult.data;
      const { userId } = authResult.data;

      const aggregate = await deps.loadGameAggregate(gameId);
      if (!aggregate) {
        sendError(res, 404, "Game not found");
        return;
      }

      if (aggregate.currentRound && aggregate.currentRound.number !== roundNumber) {
        sendError(res, 409, "Round is not current");
        return;
      }

      const resolved = await resolvePlayer(req, aggregate, userId);
      if (!resolved.ok) {
        sendError(res, resolved.status, resolved.error);
        return;
      }

      const ctx: TurnContext = {
        gameId,
        roundNumber,
        userId,
        aggregate,
        playerContext: resolved.player,
      };

      const result = await handle(ctx, resolved.body);
      if (!result.ok) {
        log.warn(`Response: ${result.status}, ${result.error}`);
        sendError(res, result.status, result.error);
        return;
      }

      const status = result.status ?? successStatus;
      log.info(`Response: ${status}`);
      sendSuccess(res, status, result.data);
    } catch (error) {
      next(error);
    }
  };
