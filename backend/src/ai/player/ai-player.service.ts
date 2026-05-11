/**
 * AI Player Service
 * Listens to game events and makes intelligent decisions for AI players
 */

import type { GiveClueService } from "@backend/game/gameplay/turns/clue/give-clue.service";
import type { MakeGuessService } from "@backend/game/gameplay/turns/guess/make-guess.service";
import type { EndTurnService } from "@backend/game/gameplay/turns/end-turn.service";
import type { GameAggregateLoader } from "@backend/game/state/load-game-aggregate";
import { findPlayerByPublicId } from "@backend/game/access";
import type { CodenamesPipeline, RankedWord } from "../pipeline";
import type {
  RunCreator,
  RunFinderByGame,
  RunStatusUpdater,
  SpymasterResponse,
  PrefilterResponse,
  RankerResponse,
  PromptAppender,
} from "@backend/shared/data-access/repositories/ai-pipeline-runs.repository";
import {
  PIPELINE_TYPE,
  PIPELINE_STATUS,
} from "@backend/shared/data-access/repositories/ai-pipeline-runs.repository";
import type { MessageCreator } from "@backend/shared/data-access/repositories/game-messages.repository";
import { MESSAGE_TYPE } from "@backend/shared/data-access/repositories/game-messages.repository";
import { GameEventsEmitter } from "@backend/shared/websocket";
import type { GameFinder } from "@backend/shared/data-access/repositories/games.repository";
import type { AppLogger } from "@backend/shared/logging";

export type AIPlayerDependencies = {
  pipeline: CodenamesPipeline;
  giveClue: GiveClueService;
  makeGuess: MakeGuessService;
  endTurn: EndTurnService;
  loadGameAggregate: GameAggregateLoader;
  // Repository functions
  createPipelineRun: RunCreator;
  findRunningPipeline: RunFinderByGame;
  updatePipelineStatus: RunStatusUpdater;
  updateSpymasterResponse: (runId: string, response: SpymasterResponse) => Promise<void>;
  updatePrefilterResponse: (runId: string, response: PrefilterResponse) => Promise<void>;
  updateRankerResponse: (runId: string, response: RankerResponse) => Promise<void>;
  appendPrompt: PromptAppender;
  createGameMessage: MessageCreator;
  findGameByPublicId: GameFinder<string>;
};

type AIDecisionContext = {
  gameId: string;
  playerId: string;
  playerInternalId: number;
  userId: number;
  role: "CODEMASTER" | "CODEBREAKER";
  roundNumber: number;
  teamId: number;
  teamName: string;
};

const activeDecisions = new Set<string>();

const delay = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Confidence thresholds for guess decisions.
 *
 * The AI is generally permissive — codenames is a game of inference,
 * not certainty — but should occasionally pass when nothing scores
 * well. Thresholds:
 *   - First guess of the turn: only guess if top score >= 0.55.
 *     If the top score is in [0.45, 0.55) we still guess (to avoid
 *     paralysis); below 0.45 we pass.
 *   - Subsequent guesses on the same clue: higher bar (0.65) since
 *     the clue's intended count has likely been satisfied already.
 */
const GUESS_THRESHOLDS = {
  firstGuessConfident: 0.55,
  firstGuessFloor: 0.45,
  subsequentGuess: 0.65,
} as const;

export const createAIPlayerService =
  (logger: AppLogger) => (dependencies: AIPlayerDependencies) => {
    const {
      pipeline,
      giveClue,
      makeGuess,
      endTurn,
      loadGameAggregate,
      createPipelineRun,
      findRunningPipeline,
      updatePipelineStatus,
      updateSpymasterResponse,
      updatePrefilterResponse,
      updateRankerResponse,
      appendPrompt,
      createGameMessage,
      findGameByPublicId,
    } = dependencies;

    const emitNarration = async (context: AIDecisionContext, content: string): Promise<void> => {
      try {
        const game = await findGameByPublicId(context.gameId);
        if (!game) return;

        const message = await createGameMessage({
          gameId: game._id,
          playerId: null,
          teamId: context.teamId,
          teamOnly: false,
          messageType: MESSAGE_TYPE.AI_THINKING,
          content,
        });

        GameEventsEmitter.gameMessageCreated(
          context.gameId,
          message.id,
          MESSAGE_TYPE.AI_THINKING,
          context.teamId,
        );
      } catch (error) {
        logger.warn("emitNarration failed", {
          gameId: context.gameId,
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    };

    /**
     * Load game state plus the AI player's record for a given gameId/playerId.
     *
     * Returns aggregate and player separately — the aggregate has no
     * playerContext field anymore; callers pass the player explicitly into
     * service calls (and through the gameplay handler).
     */
    const loadGameStateForAI = async (gameId: string, playerId: string) => {
      const aggregate = await loadGameAggregate(gameId);
      if (!aggregate || !aggregate.currentRound) return null;

      const player = findPlayerByPublicId(aggregate, playerId);
      if (!player) return null;

      return { aggregate, player };
    };

    const checkAndActIfNeeded = async (gameId: string) => {
      logger.debug("checkAndActIfNeeded START", { gameId });

      try {
        const gameState = await loadGameAggregate(gameId);

        if (!gameState) {
          logger.warn("checkAndActIfNeeded: game not found", { gameId });
          return;
        }

        if (!gameState.currentRound) {
          logger.debug("checkAndActIfNeeded: no current round", { gameId });
          return;
        }

        const currentRound = gameState.currentRound;
        const turns = currentRound.turns;
        if (!turns || turns.length === 0) {
          logger.debug("checkAndActIfNeeded: no turns", { gameId });
          return;
        }

        const currentTurn = turns[turns.length - 1];
        if (!currentTurn) {
          logger.debug("checkAndActIfNeeded: no current turn", { gameId });
          return;
        }

        logger.debug("checkAndActIfNeeded: checking turn state", {
          gameId,
          turnStatus: currentTurn.status,
          hasClue: !!currentTurn.clue,
          clueWord: currentTurn.clue?.word,
          guessesRemaining: currentTurn.guessesRemaining,
          teamName: currentTurn.teamName,
        });

        if (currentTurn.status !== "ACTIVE") {
          logger.debug("checkAndActIfNeeded: turn not active, skipping", { gameId, turnStatus: currentTurn.status });
          return;
        }

        const allPlayers = gameState.teams.flatMap((team) => team.players);
        const aiPlayers = allPlayers.filter((p) => p.isAi);

        logger.debug("checkAndActIfNeeded: found AI players", {
          gameId,
          aiPlayerCount: aiPlayers.length,
          aiPlayers: aiPlayers.map((p) => ({ publicId: p.publicId, role: p.role, teamName: p.teamName })),
        });

        if (!currentTurn.clue) {
          const teamName = currentTurn.teamName;
          const aiCodemaster = allPlayers.find(
            (p) => p.teamName === teamName && p.isAi && p.role === "CODEMASTER",
          );

          if (aiCodemaster) {
            logger.info("checkAndActIfNeeded: AI CODEMASTER should act", { gameId, playerId: aiCodemaster.publicId, teamName });

            const context: AIDecisionContext = {
              gameId,
              playerId: aiCodemaster.publicId,
              playerInternalId: aiCodemaster._id,
              userId: aiCodemaster._userId,
              role: "CODEMASTER",
              roundNumber: currentRound.number,
              teamId: aiCodemaster._teamId,
              teamName: aiCodemaster.teamName,
            };

            await aiGiveClue(context);
            return;
          }
        }

        if (currentTurn.clue && currentTurn.guessesRemaining > 0) {
          const teamName = currentTurn.teamName;
          const teamCodebreakers = allPlayers.filter(
            (p) => p.teamName === teamName && p.role === "CODEBREAKER",
          );
          const allCodebreakersAreAI =
            teamCodebreakers.length > 0 && teamCodebreakers.every((p) => p.isAi);

          if (allCodebreakersAreAI) {
            const aiCodebreaker = teamCodebreakers[0];

            logger.info("checkAndActIfNeeded: AI CODEBREAKER should act", {
              gameId,
              playerId: aiCodebreaker.publicId,
              teamName,
              clueWord: currentTurn.clue.word,
              guessesRemaining: currentTurn.guessesRemaining,
            });

            const context: AIDecisionContext = {
              gameId,
              playerId: aiCodebreaker.publicId,
              playerInternalId: aiCodebreaker._id,
              userId: aiCodebreaker._userId,
              role: "CODEBREAKER",
              roundNumber: currentRound.number,
              teamId: aiCodebreaker._teamId,
              teamName: aiCodebreaker.teamName,
            };

            await aiMakeGuess(context);
            return;
          }
        }

        logger.debug("checkAndActIfNeeded: no AI action needed", { gameId });
      } catch (error) {
        logger.error("checkAndActIfNeeded failed", {
          gameId,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    };

    const aiGiveClue = async (context: AIDecisionContext): Promise<void> => {
      const decisionKey = `clue:${context.gameId}:${context.playerId}`;

      if (activeDecisions.has(decisionKey)) {
        logger.debug("aiGiveClue: already running, skipping", { decisionKey });
        return;
      }

      activeDecisions.add(decisionKey);
      logger.info("aiGiveClue: STARTING spymaster pipeline", {
        gameId: context.gameId, playerId: context.playerId, teamName: context.teamName, roundNumber: context.roundNumber,
      });

      const game = await findGameByPublicId(context.gameId);
      if (!game) {
        logger.warn("aiGiveClue: game not found", { gameId: context.gameId });
        activeDecisions.delete(decisionKey);
        return;
      }

      let run;
      try {
        run = await createPipelineRun({ gameId: game._id, playerId: context.playerInternalId, pipelineType: PIPELINE_TYPE.SPYMASTER });
        GameEventsEmitter.aiPipelineStarted(context.gameId, run.id, PIPELINE_TYPE.SPYMASTER);
      } catch (error) {
        logger.error("aiGiveClue: pipeline run creation failed", { error: error instanceof Error ? error.message : String(error) });
        activeDecisions.delete(decisionKey);
        return;
      }

      try {
        await emitNarration(context, "Analyzing the board and thinking of a clever clue...");

        const loaded = await loadGameStateForAI(context.gameId, context.playerId);
        if (!loaded || !loaded.aggregate.currentRound) throw new Error("Failed to get game state");
        const { aggregate, player } = loaded;

        const cards = aggregate.currentRound!.cards;
        const myTeam = player.teamName;
        if (!myTeam) throw new Error("No team found");

        const friendlyWords = cards.filter((c: any) => c.teamName === myTeam && !c.selected).map((c: any) => c.word);
        const opponentWords = cards.filter((c: any) => c.teamName && c.teamName !== myTeam && !c.selected).map((c: any) => c.word);
        const assassinWord = cards.find((c: any) => c.cardType === "ASSASSIN" && !c.selected)?.word || "UNKNOWN";
        const neutralWords = cards.filter((c: any) => c.cardType === "BYSTANDER" && !c.selected).map((c: any) => c.word);

        if (friendlyWords.length === 0) throw new Error("No cards left");

        const previousClues = aggregate.currentRound!.turns
          .filter((t: any) => t.clue && t.clue.word)
          .map((t: any) => t.clue.word);

        const pipelineResult = await pipeline.runSpymasterPipeline({
          currentTeam: myTeam,
          friendlyWords, opponentWords, neutralWords, assassinWord, previousClues,
          onPromptGenerated: async (prompt) => { await appendPrompt(run.id, prompt); },
        });

        logger.info("aiGiveClue: LLM returned clue", { gameId: context.gameId, clue: pipelineResult.clue, number: pipelineResult.number });

        const spymasterResponse: SpymasterResponse = {
          clue: { word: pipelineResult.clue, targetCardCount: pipelineResult.number },
          reasoning: pipelineResult.explanation,
        };
        await updateSpymasterResponse(run.id, spymasterResponse);

        await emitNarration(context, `I've got it! The clue is "${pipelineResult.clue}" for ${pipelineResult.number}`);

        const clueResult = await giveClue({
          gameState: aggregate,
          playerContext: player,
          word: pipelineResult.clue,
          targetCardCount: pipelineResult.number,
        });

        if (clueResult.success) {
          await emitNarration(context, `Giving clue: "${pipelineResult.clue}" for ${pipelineResult.number} card(s). ${pipelineResult.explanation}`);
        }

        if (!clueResult.success) throw new Error(`Failed to give clue: ${JSON.stringify(clueResult.error)}`);

        await updatePipelineStatus(run.id, PIPELINE_STATUS.COMPLETE);
        GameEventsEmitter.aiPipelineComplete(context.gameId, run.id);
        emitNarration(context, `Clue given successfully. Let's see what the team does!`);
        setTimeout(() => { emitNarration(context, `Waiting for the next prompt...`); }, 20000);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        logger.error("aiGiveClue failed", {
          error: errorMsg,
          stack: error instanceof Error ? error.stack : undefined,
          context,
          runId: run?.id,
        });
        if (run) {
          try {
            await updatePipelineStatus(run.id, PIPELINE_STATUS.FAILED, errorMsg);
            GameEventsEmitter.aiPipelineFailed(context.gameId, run.id, errorMsg);
          } catch (cleanupError) {
            logger.error("aiGiveClue: failed to record pipeline failure", {
              gameId: context.gameId,
              runId: run.id,
              error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
            });
          }
        }
        await emitNarration(context, "Oops! Something went wrong while thinking of a clue.");
      } finally {
        activeDecisions.delete(decisionKey);
      }
    };

    const aiMakeGuess = async (context: AIDecisionContext): Promise<void> => {
      const decisionKey = `guess:${context.gameId}:${context.playerId}`;

      if (activeDecisions.has(decisionKey)) {
        logger.debug("aiMakeGuess: already running, skipping", { decisionKey });
        return;
      }

      activeDecisions.add(decisionKey);
      logger.info("aiMakeGuess: STARTING guesser pipeline", {
        gameId: context.gameId, playerId: context.playerId, teamName: context.teamName, roundNumber: context.roundNumber,
      });

      const game = await findGameByPublicId(context.gameId);
      if (!game) { activeDecisions.delete(decisionKey); return; }

      let run;
      try {
        run = await createPipelineRun({ gameId: game._id, playerId: context.playerInternalId, pipelineType: PIPELINE_TYPE.GUESSER });
        GameEventsEmitter.aiPipelineStarted(context.gameId, run.id, PIPELINE_TYPE.GUESSER);
      } catch (error) {
        logger.error("aiMakeGuess: pipeline run creation failed", {
          gameId: context.gameId,
          playerId: context.playerId,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        activeDecisions.delete(decisionKey);
        return;
      }

      try {
        const loadedTop = await loadGameStateForAI(context.gameId, context.playerId);
        if (!loadedTop || !loadedTop.aggregate.currentRound) throw new Error("Failed to get game state");
        const aggregateTop = loadedTop.aggregate;

        const currentTurn = aggregateTop.currentRound!.turns.at(-1);
        if (!currentTurn || !currentTurn.clue) throw new Error("No clue found");

        const remainingWords = aggregateTop.currentRound!.cards.filter((c: any) => !c.selected).map((c: any) => c.word);
        if (remainingWords.length === 0) throw new Error("No cards available");

        const myTeam = currentTurn.teamName;
        const clueNumber = currentTurn.clue.number;

        await emitNarration(context, `Looking at the clue "${currentTurn.clue.word}"... considering ${remainingWords.length} words...`);
        GameEventsEmitter.aiPipelineStage(context.gameId, run.id, "ranker");

        const guessResult = await pipeline.runOperativePipeline({
          currentTeam: myTeam,
          remainingWords,
          clueWord: currentTurn.clue.word,
          clueNumber: currentTurn.clue.number,
          onPromptGenerated: async (prompt: string) => { await appendPrompt(run.id, prompt); },
        });

        const rankedList: RankedWord[] = guessResult.ranked;

        if (rankedList.length === 0) {
          await emitNarration(context, "I couldn't score any words. Passing.");

          const loadedEnd = await loadGameStateForAI(context.gameId, context.playerId);
          if (!loadedEnd) throw new Error("Failed to load state for end turn");

          const endTurnResult = await endTurn({
            gameState: loadedEnd.aggregate,
            playerContext: loadedEnd.player,
          });
          if (!endTurnResult.success) throw new Error(`Failed to end turn: ${endTurnResult.error}`);

          await updatePipelineStatus(run.id, PIPELINE_STATUS.COMPLETE);
          GameEventsEmitter.aiPipelineComplete(context.gameId, run.id);
          return;
        }

        const rankerResponse: RankerResponse = {
          rankedWords: rankedList.map((r) => ({ word: r.word, score: r.score, reasoning: r.reason })),
        };
        await updateRankerResponse(run.id, rankerResponse);

        const topWordsLine = rankedList
          .slice(0, 4)
          .map((r) => `${r.word} (${(r.score * 100).toFixed(0)}%)`)
          .join(", ");
        await emitNarration(context, `Top candidates: ${topWordsLine}`);

        const maxGuesses = Math.min(clueNumber, rankedList.length);
        await emitNarration(context, `Ready to make up to ${maxGuesses} guess(es). Let's go!`);

        let correctGuesses = 0;
        let stopReason: "completed" | "wrong" | "low-confidence" | null = null;

        for (let i = 0; i < Math.min(clueNumber, rankedList.length); i++) {
          const candidate = rankedList[i];
          const isFirst = i === 0;

          // Threshold check
          if (isFirst) {
            if (candidate.score < GUESS_THRESHOLDS.firstGuessFloor) {
              await emitNarration(
                context,
                `Top word "${candidate.word}" only scores ${(candidate.score * 100).toFixed(0)}%. Nothing on this board is confident enough — passing.`,
              );
              stopReason = "low-confidence";
              break;
            }
            if (candidate.score < GUESS_THRESHOLDS.firstGuessConfident) {
              await emitNarration(
                context,
                `Top word "${candidate.word}" only scores ${(candidate.score * 100).toFixed(0)}% — taking it but cautiously.`,
              );
            }
          } else {
            if (candidate.score < GUESS_THRESHOLDS.subsequentGuess) {
              await emitNarration(
                context,
                `Next-best "${candidate.word}" only scores ${(candidate.score * 100).toFixed(0)}%. Stopping while ahead.`,
              );
              stopReason = "low-confidence";
              break;
            }
          }

          await emitNarration(context, `Closest association is "${candidate.word}"`);
          await delay(5000);

          if (candidate.score >= 0.6) {
            await emitNarration(
              context,
              `Choosing "${candidate.word}" with ${(candidate.score * 100).toFixed(0)}% confidence. ${candidate.reason}`,
            );
          }

          // Re-load state for each guess (state changes after each guess)
          const loadedGuess = await loadGameStateForAI(context.gameId, context.playerId);
          if (!loadedGuess) throw new Error("Failed to load state for guess");

          const result = await makeGuess({
            gameState: loadedGuess.aggregate,
            playerContext: loadedGuess.player,
            cardWord: candidate.word,
          });

          if (!result.success) throw new Error(`Failed to make guess: ${JSON.stringify(result.error)}`);

          const outcome = result.data.guess.outcome;

          if (outcome === "CORRECT_TEAM_CARD") {
            correctGuesses++;
            if (correctGuesses >= clueNumber) {
              stopReason = "completed";
              break;
            }
          } else {
            stopReason = "wrong";
            await emitNarration(
              context,
              `Wrong card! That was a ${outcome.toLowerCase().replace(/_/g, " ")}. My turn is over.`,
            );
            break;
          }
        }

        // End-of-turn handling
        if (stopReason === "completed") {
          const loadedEnd = await loadGameStateForAI(context.gameId, context.playerId);
          if (!loadedEnd) throw new Error("Failed to load state for end turn");

          const endTurnResult = await endTurn({
            gameState: loadedEnd.aggregate,
            playerContext: loadedEnd.player,
          });
          if (!endTurnResult.success) throw new Error(`Failed to end turn: ${endTurnResult.error}`);
          await emitNarration(context, `Perfect! Found all ${correctGuesses} cards. Ending my turn.`);
        } else if (stopReason === "low-confidence") {
          const loadedEnd = await loadGameStateForAI(context.gameId, context.playerId);
          if (!loadedEnd) throw new Error("Failed to load state for end turn");

          const endTurnResult = await endTurn({
            gameState: loadedEnd.aggregate,
            playerContext: loadedEnd.player,
          });
          if (!endTurnResult.success) throw new Error(`Failed to end turn: ${endTurnResult.error}`);
          await emitNarration(
            context,
            correctGuesses > 0
              ? `Stopped after ${correctGuesses} correct guess${correctGuesses === 1 ? "" : "es"}.`
              : `Turn ended without a guess.`,
          );
        }
        // stopReason === "wrong" → game engine ends the turn automatically

        await updatePipelineStatus(run.id, PIPELINE_STATUS.COMPLETE);
        GameEventsEmitter.aiPipelineComplete(context.gameId, run.id);
        emitNarration(context, `Move complete. Analyzing the result...`);
        setTimeout(() => { emitNarration(context, `Waiting for the next prompt...`); }, 20000);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        logger.error("aiMakeGuess failed", {
          error: errorMsg,
          stack: error instanceof Error ? error.stack : undefined,
          context,
          runId: run?.id,
        });
        if (run) {
          try {
            await updatePipelineStatus(run.id, PIPELINE_STATUS.FAILED, errorMsg);
            GameEventsEmitter.aiPipelineFailed(context.gameId, run.id, errorMsg);
          } catch (cleanupError) {
            logger.error("aiMakeGuess: failed to record pipeline failure", {
              gameId: context.gameId,
              runId: run.id,
              error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
            });
          }
        }
        await emitNarration(context, "Oops! Something went wrong while making guesses.");
      } finally {
        activeDecisions.delete(decisionKey);
      }
    };

    const initialize = () => {
      // Event listeners disabled - manual triggering only
    };

    return {
      initialize,
      checkAndActIfNeeded,
    };
  };

export type AIPlayerService = ReturnType<ReturnType<typeof createAIPlayerService>>;
