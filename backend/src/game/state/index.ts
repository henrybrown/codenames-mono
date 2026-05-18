/**
 * Public exports for the game-state layer — aggregate and turn loaders.
 *
 * Internal types and helpers are kept in `types.ts` / `helpers/` / `validation.ts`
 * and re-exported directly from those modules where needed.
 */
export { createGameAggregateLoader } from "./load-game-aggregate";
export type { GameAggregateLoader } from "./load-game-aggregate";

export { createTurnLoader } from "./load-turn-aggregate";
export type { TurnLoader, TurnData, TurnClue, TurnGuess } from "./load-turn-aggregate";
