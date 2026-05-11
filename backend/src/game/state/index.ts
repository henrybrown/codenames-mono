import type { DbContext } from "@backend/shared/data-access/transaction-handler";

import * as turnsRepository from "@backend/shared/data-access/repositories/turns.repository";
import * as playerRepository from "@backend/shared/data-access/repositories/players.repository";

import { buildTurnLoader } from "./load-turn";
import type { TurnLoader } from "./load-turn";

export { createGameAggregateLoader } from "./load-game-aggregate";
export type { GameAggregateLoader } from "./load-game-aggregate";

/**
 * The single factory for loading turn-level state (turn + clue + guesses).
 *
 * Pure data assembly with light transformation (computes hasGuesses,
 * lastGuess, prevGuesses derived fields).
 */
export const createTurnLoader = (dbContext: DbContext): TurnLoader =>
  buildTurnLoader(turnsRepository.getTurnByPublicId(dbContext));

export type { TurnLoader };

/**
 * Convenience: returns the turn loader plus a couple of related repo
 * functions consumers commonly use alongside it.
 */
export const turnState = (dbContext: DbContext) => ({
  loadTurn:             createTurnLoader(dbContext),
  getTurnsByRoundId:    turnsRepository.getTurnsByRoundId(dbContext),
  findPlayersByRoundId: playerRepository.findPlayersByRoundId(dbContext),
});
