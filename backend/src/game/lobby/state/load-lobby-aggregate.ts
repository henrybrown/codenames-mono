import type {
  DbContext,
  TransactionContext,
} from "@backend/shared/data-access/transaction-handler";

import * as gameRepository from "@backend/shared/data-access/repositories/games.repository";
import * as roundsRepository from "@backend/shared/data-access/repositories/rounds.repository";
import * as playerRepository from "@backend/shared/data-access/repositories/players.repository";
import * as teamsRepository from "@backend/shared/data-access/repositories/teams.repository";
import * as cardsRepository from "@backend/shared/data-access/repositories/cards.repository";

import type { PublicId } from "@backend/shared/data-access/repositories/games.repository";
import type { TeamResult } from "@backend/shared/data-access/repositories/teams.repository";
import type { PlayerResult } from "@backend/shared/data-access/repositories/players.repository";

import type { LobbyAggregate } from "./types";

/**
 * Load a complete LobbyAggregate from the database.
 *
 * Unlike loadGameAggregate, this loader is user-scoped: it takes a
 * userId and computes userContext (host, canModifyGame) and
 * playerContext (the user's player record) as part of the aggregate.
 * The lobby UI is always rendered for a specific user, and the
 * user-scoping is intrinsic to the aggregate.
 *
 * Works with both regular db connections and transaction contexts.
 */
/** Loader function returning a user-scoped lobby aggregate. */
export type LobbyAggregateLoader = (
  gameId: PublicId,
  userId: number,
) => Promise<LobbyAggregate | null>;

/**
 * Builds a lobby loader bound to a particular DB context.
 *
 * Unlike the gameplay aggregate loader, this one takes a `userId` and
 * embeds derived `userContext` and `playerContext` fields — the lobby UI
 * is always rendered for a specific viewer.
 */
export const createLobbyAggregateLoader = (
  dbContext: DbContext | TransactionContext,
): LobbyAggregateLoader => {
  const getGameById        = gameRepository.findGameByPublicId(dbContext);
  const getTeams           = teamsRepository.getTeamsByGameId(dbContext);
  const getPlayersByGameId = playerRepository.findPlayersByGameId(dbContext);
  const getRoundsByGameId  = roundsRepository.getRoundsByGameId(dbContext);
  const getCardsByRoundId  = cardsRepository.getCardsByRoundId(dbContext);

  return async (gameId, userId) => {
    const game = await getGameById(gameId);
    if (!game) return null;

    const [teams, players, rounds] = await Promise.all([
      getTeams(game._id),
      getPlayersByGameId(game._id),
      getRoundsByGameId(game._id),
    ]);

    const teamsWithPlayers = teams.map((team: TeamResult) => ({
      _id: team._id,
      _gameId: team._gameId,
      teamName: team.teamName,
      players: players.filter(
        (player: PlayerResult) => player._teamId === team._id,
      ),
    }));

    const userPlayer = players.find((player) => player._userId === userId);
    const isHost = game.host_user_id === userId;
    const canModifyGame = !!userPlayer;

    const playerContext = userPlayer ? {
      _userId: userPlayer._userId,
      _id: userPlayer._id,
      _teamId: userPlayer._teamId,
      username: userPlayer.username,
      publicName: userPlayer.publicName,
      teamName: userPlayer.teamName,
      role: userPlayer.role,
    } : null;

    // Find current round (latest incomplete round) and historical rounds
    const sortedRounds = rounds.sort((a, b) => b.roundNumber - a.roundNumber);
    const currentRound = sortedRounds.find((r) => r.status !== "COMPLETED") || null;
    const historicalRounds = sortedRounds.filter((r) => r.status === "COMPLETED");

    return {
      _id: game._id,
      public_id: game.public_id,
      host_user_id: game.host_user_id,
      status: game.status,
      game_format: game.game_format,
      gameType: game.game_type,
      aiMode: game.ai_mode,
      teams: teamsWithPlayers,
      currentRound: currentRound ? {
        _id: currentRound._id,
        number: currentRound.roundNumber,
        status: currentRound.status,
        cards: await getCardsByRoundId(currentRound._id).then((cards) =>
          cards.map((card) => ({
            _id: card._id,
            _roundId: card._roundId,
            _teamId: card._teamId,
            teamName: card.teamName,
            word: card.word,
            cardType: card.cardType,
            selected: card.selected,
          }))
        ),
        players: [],
        createdAt: currentRound.createdAt,
      } : null,
      historicalRounds: historicalRounds.map((r) => ({
        _id: r._id,
        number: r.roundNumber,
        status: r.status,
        _winningTeamId: r._winningTeamId,
        winningTeamName: r.winningTeamName,
        createdAt: r.createdAt,
      })),
      userContext: {
        _userId: userId,
        canModifyGame,
        isHost,
      },
      playerContext,
      createdAt: game.created_at,
      updatedAt: game.updated_at,
    };
  };
};
