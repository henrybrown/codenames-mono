/**
 * Loads complete game state into a single `GameAggregate`.
 *
 * Pure data assembly — no auth, no request-time identity. Callers that
 * need the acting player resolve it separately and pass it explicitly
 * into action services.
 *
 * Works with both regular db connections and transaction contexts so it
 * can be reused inside transactional reloads.
 */

import type {
  DbContext,
  TransactionContext,
} from "@backend/shared/data-access/transaction-handler";

import * as gameRepository from "@backend/shared/data-access/repositories/games.repository";
import * as roundsRepository from "@backend/shared/data-access/repositories/rounds.repository";
import * as playerRepository from "@backend/shared/data-access/repositories/players.repository";
import * as teamsRepository from "@backend/shared/data-access/repositories/teams.repository";
import * as cardsRepository from "@backend/shared/data-access/repositories/cards.repository";
import * as turnsRepository from "@backend/shared/data-access/repositories/turns.repository";

import type { TeamResult } from "@backend/shared/data-access/repositories/teams.repository";
import type { PlayerResult } from "@backend/shared/data-access/repositories/players.repository";
import type { CardResult } from "@backend/shared/data-access/repositories/cards.repository";

import type { GameAggregate } from "./types";

/** Loader function returning a fully-assembled aggregate, or null when no
 *  game has that public id. */
export type GameAggregateLoader = (gameId: string) => Promise<GameAggregate | null>;

/**
 * Builds an aggregate loader bound to a particular DB context.
 *
 * Each call fans out across the games, teams, players, rounds, cards, and
 * turns repositories. Bind once per request / transaction and reuse the
 * returned loader for any number of `gameId` lookups.
 */
export const createGameAggregateLoader = (
  dbContext: DbContext | TransactionContext,
): GameAggregateLoader => {
  const getGameById        = gameRepository.findGameByPublicId(dbContext);
  const getTeams           = teamsRepository.getTeamsByGameId(dbContext);
  const getCardsByRoundId  = cardsRepository.getCardsByRoundId(dbContext);
  const getTurnsByRoundId  = turnsRepository.getTurnsByRoundId(dbContext);
  const getPlayersByGameId = playerRepository.findPlayersByGameId(dbContext);
  const getLatestRound     = roundsRepository.getLatestRound(dbContext);
  const getAllRounds       = roundsRepository.getRoundsByGameId(dbContext);

  return async (gameId: string): Promise<GameAggregate | null> => {
    const game = await getGameById(gameId);
    if (!game) return null;

    const [teams, allRounds, latestRound, players] = await Promise.all([
      getTeams(game._id),
      getAllRounds(game._id),
      getLatestRound(game._id),
      getPlayersByGameId(game._id),
    ]);

    const teamsWithPlayers = teams.map((team: TeamResult) => ({
      _id: team._id,
      _gameId: team._gameId,
      teamName: team.teamName,
      players: players.filter((player: PlayerResult) => player._teamId === team._id),
    }));

    const historicalRounds = allRounds
      .filter((round) => !latestRound || round._id !== latestRound._id)
      .map((round) => ({
        _id: round._id,
        number: round.roundNumber,
        status: round.status,
        _winningTeamId: round._winningTeamId,
        winningTeamName: round.winningTeamName,
        createdAt: round.createdAt,
      }));

    const base = {
      _id: game._id,
      public_id: game.public_id,
      status: game.status,
      game_type: game.game_type,
      game_format: game.game_format,
      aiMode: game.ai_mode,
      teams: teamsWithPlayers,
      historicalRounds,
      createdAt: game.created_at,
      updatedAt: game.updated_at,
    };

    if (!latestRound) {
      return { ...base, currentRound: null } as GameAggregate;
    }

    const [cards, turns] = await Promise.all([
      getCardsByRoundId(latestRound._id),
      getTurnsByRoundId(latestRound._id),
    ]);

    const cardsMapped = cards.map((card: CardResult) => ({
      _id: card._id,
      _roundId: card._roundId,
      _teamId: card._teamId,
      teamName: card.teamName,
      word: card.word,
      cardType: card.cardType,
      selected: card.selected,
    }));

    return {
      ...base,
      currentRound: {
        _id: latestRound._id,
        number: latestRound.roundNumber,
        status: latestRound.status,
        winningTeamName: latestRound.winningTeamName,
        _winningTeamId: latestRound._winningTeamId,
        players,
        cards: cardsMapped,
        turns,
        createdAt: latestRound.createdAt,
      },
    } as GameAggregate;
  };
};
