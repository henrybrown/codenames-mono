import type { GameAggregateLoader } from "@backend/game/state/load-game-aggregate";
import type { TurnLoader } from "@backend/game/state/load-turn-aggregate";
import type { GameplayHandler } from "../../gameplay-actions";
import type { AppLogger } from "@backend/shared/logging";
import type { GameAggregate } from "@backend/game/state/types";
import type { GamePlayer } from "@backend/game/access";
import type { PlayerRole, TurnOutcome } from "@codenames/shared/types";
import { GAME_TYPE } from "@codenames/shared/types";
import {
  resolveActingPlayerForRole,
  resolveActingPlayerForUser,
} from "@backend/game/access";
import { GameEventsEmitter } from "@backend/shared/websocket";
import { getCurrentTurn } from "@backend/game/state/helpers";
import {
  buildCompleteTurnData,
  type CompleteTurnData,
} from "../shared/present-turn";
import { determineOutcomeStrategy } from "./outcome-strategy";
import { UnexpectedGameplayError } from "../../errors/gameplay.errors";

/**
 * Input to the make-guess service.
 *
 * Exactly one of `role` (single-device) or `playerId` (multi-device) is
 * expected; the service picks based on the loaded aggregate's game type.
 */
export type MakeGuessInput = {
  gameId: string;
  roundNumber: number;
  userId: number;
  cardWord: string;
  role?: PlayerRole;
  playerId?: string;
};

/** Successful make-guess payload — the guess plus the full turn shape. */
export type MakeGuessSuccess = {
  guess: {
    cardWord: string;
    outcome: TurnOutcome;
    createdAt: Date;
  };
  turn: CompleteTurnData;
};

/** Tagged result for the make-guess service. */
export type MakeGuessResult =
  | { success: true; data: MakeGuessSuccess }
  | {
      success: false;
      message: string;
      notFound?: boolean;
      conflict?: boolean;
    };

/** Wiring dependencies for the make-guess service. */
export type MakeGuessDependencies = {
  gameplayHandler: GameplayHandler;
  loadGameAggregate: GameAggregateLoader;
  loadTurn: TurnLoader;
};

const resolvePlayer = (
  aggregate: GameAggregate,
  input: MakeGuessInput,
): GamePlayer | null => {
  if (aggregate.game_type === GAME_TYPE.SINGLE_DEVICE) {
    if (!input.role) return null;
    return resolveActingPlayerForRole(aggregate, input.role);
  }
  return resolveActingPlayerForUser(aggregate, input.userId);
};

/**
 * Defensive fallback: when round/game ended and the turn data can't be
 * loaded fresh, build a minimal COMPLETED turn shape so the response
 * stays well-formed.
 */
function buildMinimalCompletedTurnShape(guessTurn: {
  _teamId: number;
  guessesRemaining: number;
  createdAt: Date;
  completedAt?: Date | null;
}): CompleteTurnData {
  return {
    id: "",
    teamName: "",
    status: "COMPLETED",
    guessesRemaining: guessTurn.guessesRemaining,
    createdAt: guessTurn.createdAt,
    completedAt: guessTurn.completedAt ?? new Date(),
    clue: undefined,
    hasGuesses: true,
    prevGuesses: [],
    active: null,
  };
}

/**
 * Builds the make-guess service.
 *
 * Loads the aggregate, validates the round, resolves the acting player,
 * persists the guess, and then runs the post-guess cascade (continue /
 * end-turn / end-round / end-game) inside the same transaction. Emits
 * the appropriate WebSocket events on success.
 */
export const makeGuessService =
  (logger: AppLogger) =>
  (deps: MakeGuessDependencies) =>
  async (input: MakeGuessInput): Promise<MakeGuessResult> => {
    const { cardWord } = input;
    const log = logger.for({}).withMeta({ gameId: input.gameId }).create();
    log.info(`makeGuess called: cardWord=${cardWord}`);

    const aggregate = await deps.loadGameAggregate(input.gameId);
    if (!aggregate) {
      return { success: false, message: "Game not found", notFound: true };
    }

    if (!aggregate.currentRound) {
      return { success: false, message: "No current round" };
    }

    if (aggregate.currentRound.number !== input.roundNumber) {
      return { success: false, message: "Round is not current", conflict: true };
    }

    const playerContext = resolvePlayer(aggregate, input);
    if (!playerContext) {
      const message =
        aggregate.game_type === GAME_TYPE.SINGLE_DEVICE
          ? "No player for that role on the active turn"
          : "Not a player in this game";
      return { success: false, message, notFound: true };
    }

    const result = await deps.gameplayHandler(
      aggregate,
      playerContext,
      async (ops) => {
        const guessResult = await ops.makeGuess(cardWord);
        if (!guessResult.ok) return guessResult;

        const strategy = determineOutcomeStrategy({
          outcome: guessResult.guess.outcome,
          postGuessState: await ops.state(),
        });

        switch (strategy.strategy) {
          case "continue":
            break;
          case "end-turn": {
            const r = await ops.endTurn(strategy.turnId);
            if (!r.ok) {
              throw new UnexpectedGameplayError(
                `Failed to endTurn during cascade: ${r.message}`,
              );
            }
            break;
          }
          case "end-round": {
            const t = await ops.endTurn(strategy.turnId);
            if (!t.ok) {
              throw new UnexpectedGameplayError(
                `Failed to endTurn during cascade: ${t.message}`,
              );
            }
            const r = await ops.endRound(
              strategy.roundId,
              strategy.roundWinningTeamId,
            );
            if (!r.ok) {
              throw new UnexpectedGameplayError(
                `Failed to endRound during cascade: ${r.message}`,
              );
            }
            break;
          }
          case "end-game": {
            const t = await ops.endTurn(strategy.turnId);
            if (!t.ok) {
              throw new UnexpectedGameplayError(
                `Failed to endTurn during cascade: ${t.message}`,
              );
            }
            const r = await ops.endRound(
              strategy.roundId,
              strategy.roundWinningTeamId,
            );
            if (!r.ok) {
              throw new UnexpectedGameplayError(
                `Failed to endRound during cascade: ${r.message}`,
              );
            }
            await ops.endGame(strategy.gameWinningTeamId);
            break;
          }
        }

        return {
          ok: true as const,
          guess: guessResult.guess,
          strategy,
          state: await ops.state(),
        };
      },
    );

    if (!result.ok) {
      log.warn(`makeGuess failed: ${result.message}`);
      return { success: false, message: result.message };
    }

    const responseTurnPublicId =
      getCurrentTurn(result.state)?.publicId
      ?? aggregate.currentRound.turns.find((t) => t._id === result.guess.turn._id)?.publicId
      ?? "";

    const turnData = responseTurnPublicId
      ? await buildCompleteTurnData(
          deps.loadTurn,
          responseTurnPublicId,
          result.state.currentRound?.players
            ?? aggregate.currentRound.players
            ?? [],
        )
      : null;

    GameEventsEmitter.guessMade(
      aggregate.public_id,
      aggregate.currentRound.number,
      responseTurnPublicId,
      playerContext.publicId,
    );

    const turnEnded = result.strategy.strategy !== "continue";
    if (turnEnded && responseTurnPublicId) {
      GameEventsEmitter.turnEnded(
        aggregate.public_id,
        aggregate.currentRound.number,
        responseTurnPublicId,
      );
    }

    log.info(
      `makeGuess success: cardWord=${cardWord}, outcome=${result.guess.outcome}, strategy=${result.strategy.strategy}`,
    );
    return {
      success: true,
      data: {
        guess: {
          cardWord,
          outcome: result.guess.outcome,
          createdAt: result.guess.createdAt,
        },
        turn: turnData ?? buildMinimalCompletedTurnShape(result.guess.turn),
      },
    };
  };

/** Service-call signature for making a guess. */
export type MakeGuessService = ReturnType<ReturnType<typeof makeGuessService>>;
