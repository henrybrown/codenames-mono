import type { DbContext } from "@backend/shared/data-access/transaction-handler";

import * as turnsRepository from "@backend/shared/data-access/repositories/turns.repository";
import * as playerRepository from "@backend/shared/data-access/repositories/players.repository";

import { turnStateProvider } from "./turn-state.provider";

export { createGameAggregateLoader } from "./load-game-aggregate";
export type { GameAggregateLoader } from "./load-game-aggregate";

/* -------------------------------------------------------------------------- */
/* Turn state — renamed to createTurnLoader in step 5                         */
/* -------------------------------------------------------------------------- */

/**
 * Creates a turn state provider with the given database context
 * Works with both regular db connections and transaction contexts
 */
export const createTurnStateProvider = (dbContext: DbContext) =>
  turnStateProvider(turnsRepository.getTurnByPublicId(dbContext));

export type TurnStateProvider = ReturnType<typeof createTurnStateProvider>;

/**
 * Creates turn state components with all repository dependencies pre-wired
 */
export const turnState = (dbContext: DbContext) => ({
  provider:             createTurnStateProvider(dbContext),
  getTurnsByRoundId:    turnsRepository.getTurnsByRoundId(dbContext),
  findPlayersByRoundId: playerRepository.findPlayersByRoundId(dbContext),
});
