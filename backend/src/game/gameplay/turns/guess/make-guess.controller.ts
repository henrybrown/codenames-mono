import type { MakeGuessService } from "./make-guess.service";
import type { AppLogger } from "@backend/shared/logging";
import type { GameAggregateLoader } from "@backend/game/state/load-game-aggregate";
import {
  resolveActingPlayerForRole,
  resolveActingPlayerForUser,
} from "@backend/game/access";
import { GAME_TYPE } from "@codenames/shared/types";
import {
  withTurnContext,
  type ResolvePlayer,
} from "../shared/with-turn-context";
import {
  makeGuessSingleDeviceBody,
  makeGuessMultiDeviceBody,
} from "./make-guess.validation";

export type Dependencies = {
  makeGuess: MakeGuessService;
  loadGameAggregate: GameAggregateLoader;
};

type GuessPayload = { cardWord: string };

const resolveGuessPlayer: ResolvePlayer<GuessPayload> = (req, aggregate, userId) => {
  if (aggregate.game_type === GAME_TYPE.SINGLE_DEVICE) {
    const bodyResult = makeGuessSingleDeviceBody.safeParse(req.body);
    if (!bodyResult.success) {
      return { ok: false, status: 400, error: "Invalid request body" };
    }
    const player = resolveActingPlayerForRole(aggregate, bodyResult.data.role);
    if (!player) {
      return { ok: false, status: 404, error: "No player for that role on the active turn" };
    }
    return { ok: true, player, body: { cardWord: bodyResult.data.cardWord } };
  }

  const bodyResult = makeGuessMultiDeviceBody.safeParse(req.body);
  if (!bodyResult.success) {
    return { ok: false, status: 400, error: "Invalid request body" };
  }
  // Middleware already verified user is a member; this resolves the player record.
  const player = resolveActingPlayerForUser(aggregate, userId);
  if (!player) {
    // Defensive: middleware should have caught this.
    return { ok: false, status: 403, error: "Not a player in this game" };
  }
  return { ok: true, player, body: { cardWord: bodyResult.data.cardWord } };
};

export const makeGuessController = (logger: AppLogger) => (deps: Dependencies) =>
  withTurnContext({ logger, loadGameAggregate: deps.loadGameAggregate })<GuessPayload, unknown>(
    "POST /guesses",
    resolveGuessPlayer,
    async (ctx, body) => {
      const result = await deps.makeGuess({
        gameState: ctx.aggregate,
        playerContext: ctx.playerContext,
        cardWord: body.cardWord,
      });
      if (!result.success) {
        return { ok: false, status: 400, error: result.message };
      }
      return { ok: true, data: result.data };
    },
  );
