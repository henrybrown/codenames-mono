/**
 * Player — event-driven AI decision loop
 *
 * Subscribes to game events (via the AI feature's internal event bus)
 * and drives spymaster/guesser pipelines for AI players.
 */

import type { AppLogger } from "@backend/shared/logging";
import type { CodenamesPipeline } from "../pipeline";
import type { GiveClueService } from "@backend/game/gameplay/turns/clue/give-clue.service";
import type { MakeGuessService } from "@backend/game/gameplay/turns/guess/make-guess.service";
import type { EndTurnService } from "@backend/game/gameplay/turns/end-turn.service";
import type { GameDataLoader } from "@backend/game/gameplay/state/load-game-aggregate";
import type {
  RunCreator,
  RunFinderByGame,
  RunStatusUpdater,
  SpymasterResponse,
  PrefilterResponse,
  RankerResponse,
  PromptAppender,
} from "@backend/shared/data-access/repositories/ai-pipeline-runs.repository";
import type { MessageCreator } from "@backend/shared/data-access/repositories/game-messages.repository";
import type { GameFinder } from "@backend/shared/data-access/repositories/games.repository";
import { createAIPlayerService } from "./ai-player.service";
import type { AIPlayerService } from "./ai-player.service";

export type { AIPlayerService } from "./ai-player.service";
export { gameEventBus, emitServerGameEvent } from "./game-event-bus";

export interface PlayerDependencies {
  pipeline: CodenamesPipeline;
  // Gameplay services
  giveClue: GiveClueService;
  makeGuess: MakeGuessService;
  endTurn: EndTurnService;
  loadGameData: GameDataLoader;
  // AI feature repositories
  createPipelineRun: RunCreator;
  findRunningPipeline: RunFinderByGame;
  updatePipelineStatus: RunStatusUpdater;
  updateSpymasterResponse: (runId: string, response: SpymasterResponse) => Promise<void>;
  updatePrefilterResponse: (runId: string, response: PrefilterResponse) => Promise<void>;
  updateRankerResponse: (runId: string, response: RankerResponse) => Promise<void>;
  appendPrompt: PromptAppender;
  createGameMessage: MessageCreator;
  findGameByPublicId: GameFinder<string>;
}

export const createPlayer =
  (logger: AppLogger) =>
  (deps: PlayerDependencies): AIPlayerService =>
    createAIPlayerService(logger)(deps);
