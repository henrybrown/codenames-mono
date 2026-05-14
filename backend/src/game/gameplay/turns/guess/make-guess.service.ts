import type { TurnLoader } from "@backend/game/state/load-turn-aggregate";
import type { GameplayHandler } from "../../gameplay-actions";
import type { AppLogger } from "@backend/shared/logging";
import type { GameAggregate } from "@backend/game/state/types";
import type { GamePlayer } from "@backend/game/access";
import type { TurnOutcome } from "@codenames/shared/types";
import { GameEventsEmitter } from "@backend/shared/websocket";
import { getCurrentTurn } from "@backend/game/state/helpers";
import {
  buildCompleteTurnData,
  type CompleteTurnData,
} from "../shared/present-turn";
import { determineOutcomeStrategy } from "./outcome-strategy";
import { UnexpectedGameplayError } from "../../errors/gameplay.errors";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type MakeGuessInput = {
  gameState: GameAggregate;
  playerContext: GamePlayer;
  cardWord: string;
};

export type MakeGuessSuccess = {
  guess: {
    cardWord: string;
    outcome: TurnOutcome;
    createdAt: Date;
  };
  turn: CompleteTurnData;
};

export type MakeGuessResult =
  | { success: true; data: MakeGuessSuccess }
  | { success: false; message: string };

export type MakeGuessDependencies = {
  gameplayHandler: GameplayHandler;
  loadTurn: TurnLoader;
};

/* -------------------------------------------------------------------------- */
/* Service                                                                    */
/* -------------------------------------------------------------------------- */

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

export const makeGuessService =
  (logger: AppLogger) =>
  (deps: MakeGuessDependencies) =>
  async (input: MakeGuessInput): Promise<MakeGuessResult> => {
    const { gameState, playerContext, cardWord } = input;
    const log = logger.for({}).withMeta({ gameId: gameState.public_id }).create();
    log.info(`makeGuess called: cardWord=${cardWord}`);

    if (!gameState.currentRound) {
      log.warn("makeGuess failed: no current round");
      return { success: false, message: "No current round" };
    }

    const result = await deps.gameplayHandler(
      gameState,
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
      ?? gameState.currentRound.turns.find((t) => t._id === result.guess.turn._id)?.publicId
      ?? "";

    const turnData = responseTurnPublicId
      ? await buildCompleteTurnData(
          deps.loadTurn,
          responseTurnPublicId,
          result.state.currentRound?.players
            ?? gameState.currentRound.players
            ?? [],
        )
      : null;

    GameEventsEmitter.guessMade(
      gameState.public_id,
      gameState.currentRound.number,
      responseTurnPublicId,
      playerContext.publicId,
    );

    const turnEnded = result.strategy.strategy !== "continue";
    if (turnEnded && responseTurnPublicId) {
      GameEventsEmitter.turnEnded(
        gameState.public_id,
        gameState.currentRound.number,
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

export type MakeGuessService = ReturnType<ReturnType<typeof makeGuessService>>;
