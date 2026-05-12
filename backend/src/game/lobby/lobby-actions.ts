import type { TransactionContext } from "@backend/shared/data-access/transaction-handler";
import * as playersRepository from "@backend/shared/data-access/repositories/players.repository";
import * as playerRolesRepository from "@backend/shared/data-access/repositories/player-roles.repository";
import * as gamesRepository from "@backend/shared/data-access/repositories/games.repository";
import * as roundsRepository from "@backend/shared/data-access/repositories/rounds.repository";
import * as cardsRepository from "@backend/shared/data-access/repositories/cards.repository";
import * as turnRepository from "@backend/shared/data-access/repositories/turns.repository";
import * as gameEventsRepository from "@backend/shared/data-access/repositories/game-events.repository";

import * as newRoundActions from "./rounds/new-round.actions";
import * as dealCardsActions from "./rounds/deal-cards.actions";
import * as startRoundActions from "./rounds/start-round.actions";
import * as assignRolesActions from "./rounds/assign-roles.actions";

import { createLobbyAggregateLoader } from "./state";
import { UnexpectedLobbyError } from "./errors/lobby.errors";

/**
 * Wrapper around gameplay state provider to throw if not found
 */
const getGameStateOrThrow =
  (trx: TransactionContext) => async (gameId: string, userId: number) => {
    const lobby = await createLobbyAggregateLoader(trx)(gameId, userId);

    if (!lobby)
      throw new UnexpectedLobbyError("Lobby data not found");

    return lobby;
  };


/**
 * Creates lobby operations for use within a transaction context
 *
 * @param trx - Database transaction context
 * @returns Object containing all lobby operations
 */
export const lobbyOperations = (trx: TransactionContext) => ({
  loadLobbyAggregate: getGameStateOrThrow(trx),
  addPlayers: playersRepository.addPlayers(trx),
  removePlayer: playersRepository.removePlayer(trx),
  modifyPlayers: playersRepository.modifyPlayers(trx),
  updateGameStatus: gamesRepository.updateGameStatus(trx),
  
  createRound: newRoundActions.createNextRound(
    roundsRepository.createNewRound(trx),
  ),
  assignPlayerRoles: assignRolesActions.assignRolesRandomly(
    playerRolesRepository.assignPlayerRoles(trx),
    (gameId: number) =>
      playersRepository.getRoleHistory(trx)(gameId, "CODEMASTER"),
    playerRolesRepository.findRoleIdsByName(trx),
  ),
  dealCards: dealCardsActions.dealCardsToRound(
    cardsRepository.getRandomWords(trx),
    cardsRepository.replaceCards(trx),
    gameEventsRepository.createEvent(trx),
  ),
  startRound: startRoundActions.startCurrentRound(
    roundsRepository.updateRoundStatus(trx),
    turnRepository.createTurn(trx),
  ),
});

/**
 * Type representing all operations available within lobby transactions
 */
export type LobbyOperations = ReturnType<typeof lobbyOperations>;
