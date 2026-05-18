import type { TransactionContext } from "@backend/shared/data-access/transaction-handler";
import * as gamesRepository from "@backend/shared/data-access/repositories/games.repository";
import * as teamsRepository from "@backend/shared/data-access/repositories/teams.repository";
import * as playersRepository from "@backend/shared/data-access/repositories/players.repository";

/**
 * Builds the setup operations registry within a transaction.
 *
 * Smaller than `lobbyOperations` — game-creation only needs games, teams,
 * and players, no rounds or events.
 */
export const setupOperations = (trx: TransactionContext) => ({
  getGame: gamesRepository.findGameByPublicId(trx),
  createGame: gamesRepository.createGame(trx),
  createTeams: teamsRepository.createTeams(trx),
  addPlayers: playersRepository.addPlayers(trx),
});

/** All operations available within a setup transaction. */
export type SetupOperations = ReturnType<typeof setupOperations>;
