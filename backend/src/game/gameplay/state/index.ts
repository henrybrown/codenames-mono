import {
  DbContext,
  TransactionContext,
} from "@backend/shared/data-access/transaction-handler";

import * as gameRepository from "@backend/shared/data-access/repositories/games.repository";
import * as roundsRepository from "@backend/shared/data-access/repositories/rounds.repository";
import * as playerRepository from "@backend/shared/data-access/repositories/players.repository";
import * as teamsRepository from "@backend/shared/data-access/repositories/teams.repository";
import * as cardsRepository from "@backend/shared/data-access/repositories/cards.repository";
import * as turnsRepository from "@backend/shared/data-access/repositories/turns.repository";

import { turnStateProvider } from "./turn-state.provider";
import { gameplayStateProvider } from "./gameplay-state.provider";
import {
  createGameAggregateLoader,
  type GameAggregateLoader,
} from "./load-game-aggregate";
import { createGameMembershipVerifier } from "./verify-game-membership";
import { createPlayerContextResolver } from "./resolve-player-context";
import { createGameplayStateProvider } from "./get-gameplay-state";

/**
 * Creates a turn state provider with the given database context
 * Works with both regular db connections and transaction contexts
 *
 * @param dbContext - Database connection or transaction context
 * @returns Turn state provider that uses the given context
 */
export const createTurnStateProvider = (dbContext: DbContext) => {
  return turnStateProvider(turnsRepository.getTurnByPublicId(dbContext));
};

export type TurnStateProvider = ReturnType<typeof createTurnStateProvider>;

/**
 * Creates turn state components with all repository dependencies pre-wired
 *
 * @param dbContext - Database connection or transaction context
 * @returns Object containing configured state components
 */
export const turnState = (dbContext: DbContext) => {
  return {
    provider: createTurnStateProvider(dbContext),
    getTurnsByRoundId: turnsRepository.getTurnsByRoundId(dbContext),
    findPlayersByRoundId: playerRepository.findPlayersByRoundId(dbContext),
  };
};

// LEGACY: the old auth+fetch+identify-merged provider.
// Removed in step 6 once all callers have migrated to the new provider.
const createLegacyProvider = (
  dbContext: DbContext | TransactionContext,
) => {
  return gameplayStateProvider(
    gameRepository.findGameByPublicId(dbContext),
    teamsRepository.getTeamsByGameId(dbContext),
    cardsRepository.getCardsByRoundId(dbContext),
    turnsRepository.getTurnsByRoundId(dbContext),
    playerRepository.findPlayersByGameId(dbContext),
    roundsRepository.getLatestRound(dbContext),
    roundsRepository.getRoundsByGameId(dbContext),
    playerRepository.getPlayerContext(dbContext),
    playerRepository.findPlayerByPublicId(dbContext),
  );
};


/**
 * Creates an auth-free game data loader with the given database context
 */
const createInternalGameDataLoader = (
  dbContext: DbContext | TransactionContext,
): GameAggregateLoader => {
  return createGameAggregateLoader({
    getGameById: gameRepository.findGameByPublicId(dbContext),
    getTeams: teamsRepository.getTeamsByGameId(dbContext),
    getCardsByRoundId: cardsRepository.getCardsByRoundId(dbContext),
    getTurnsByRoundId: turnsRepository.getTurnsByRoundId(dbContext),
    getPlayersByGameId: playerRepository.findPlayersByGameId(dbContext),
    getLatestRound: roundsRepository.getLatestRound(dbContext),
    getAllRounds: roundsRepository.getRoundsByGameId(dbContext),
  });
};

/**
 * Creates gameplay state components with all repository dependencies pre-wired
 *
 * @param dbContext - Database connection or transaction context
 * @returns Object containing configured state components
 */
export const gameplayState = (dbContext: DbContext | TransactionContext) => {
  // Building blocks
  const loadAggregate = createInternalGameDataLoader(dbContext);
  const verifyMembership = createGameMembershipVerifier({
    getGameById: gameRepository.findGameByPublicId(dbContext),
    getPlayersByGameId: playerRepository.findPlayersByGameId(dbContext),
  });
  const resolvePlayerContext = createPlayerContextResolver();

  // Primary entry point — read-only request lifecycle (auth -> load -> identify)
  const getGameplayState = createGameplayStateProvider({
    loadAggregate,
    verifyMembership,
    resolvePlayerContext,
  });

  return {
    // Primary entry point most callers use
    provider: getGameplayState,
    // Building blocks for callers that need to interleave a DB mutation
    // (action services) or only need part of the lifecycle (chat membership-only).
    loader: loadAggregate,
    loadGameAggregate: loadAggregate,
    verifyMembership,
    resolvePlayerContext,
    // LEGACY: removed in step 6.
    legacyProvider: createLegacyProvider(dbContext),
  };
};

/**
 * Convenience: returns just the auth-free game data loader
 */
export const gameDataLoader = (dbContext: DbContext | TransactionContext): GameAggregateLoader => {
  return createInternalGameDataLoader(dbContext);
};

export type { GameAggregateLoader, GameAggregateLoader as GameDataLoader };
