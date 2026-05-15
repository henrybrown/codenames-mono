import type { TransactionContext } from "@backend/shared/data-access/transaction-handler";
import * as gamesRepository from "@backend/shared/data-access/repositories/games.repository";
import * as teamsRepository from "@backend/shared/data-access/repositories/teams.repository";
import * as playersRepository from "@backend/shared/data-access/repositories/players.repository";

export const setupOperations = (trx: TransactionContext) => ({
  getGame: gamesRepository.findGameByPublicId(trx),
  createGame: gamesRepository.createGame(trx),
  createTeams: teamsRepository.createTeams(trx),
  addPlayers: playersRepository.addPlayers(trx),
});

export type SetupOperations = ReturnType<typeof setupOperations>;
