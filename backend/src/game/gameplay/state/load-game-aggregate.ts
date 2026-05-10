/**
 * Load a complete GameAggregate from the database.
 *
 * Pure data assembly — no auth, no playerContext. The returned
 * aggregate has playerContext === null. Callers that need
 * playerContext should compose this with resolvePlayerContext.
 *
 * Used directly by:
 *   - the AI player (no userId concept)
 *   - transactional reloads inside actions (membership already verified)
 *   - getGameplayState (composed with verifyMembership + resolvePlayerContext)
 */

import {
  PublicId,
  InternalId,
  GameFinder,
} from "@backend/shared/data-access/repositories/games.repository";

import { TeamsFinder, TeamResult } from "@backend/shared/data-access/repositories/teams.repository";

import {
  PlayerFinderAll,
  PlayerResult,
} from "@backend/shared/data-access/repositories/players.repository";

import {
  RoundFinder,
  RoundId,
  RoundFinderAll,
} from "@backend/shared/data-access/repositories/rounds.repository";

import { CardsFinder, CardResult } from "@backend/shared/data-access/repositories/cards.repository";

import { TurnsFinder } from "@backend/shared/data-access/repositories/turns.repository";

import { GameAggregate } from "./gameplay-state.types";

export type GameAggregateLoader = (gameId: string) => Promise<GameAggregate | null>;

export type GameAggregateLoaderDeps = {
  getGameById: GameFinder<PublicId>;
  getTeams: TeamsFinder<InternalId>;
  getCardsByRoundId: CardsFinder<RoundId>;
  getTurnsByRoundId: TurnsFinder<RoundId>;
  getPlayersByGameId: PlayerFinderAll<InternalId>;
  getLatestRound: RoundFinder<InternalId>;
  getAllRounds: RoundFinderAll<InternalId>;
};

export const createGameAggregateLoader = (deps: GameAggregateLoaderDeps): GameAggregateLoader => {
  const {
    getGameById,
    getTeams,
    getCardsByRoundId,
    getTurnsByRoundId,
    getPlayersByGameId,
    getLatestRound,
    getAllRounds,
  } = deps;

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
      playerContext: null,
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

