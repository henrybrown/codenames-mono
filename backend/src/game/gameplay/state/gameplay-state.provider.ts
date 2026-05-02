import {
  PublicId,
  InternalId,
  GameFinder,
} from "@backend/shared/data-access/repositories/games.repository";

import { TeamsFinder, TeamResult } from "@backend/shared/data-access/repositories/teams.repository";

import {
  PlayerFinderAll,
  PlayerResult,
  PlayerContextFinder,
  PlayerFinderByPublicId,
} from "@backend/shared/data-access/repositories/players.repository";

import {
  RoundFinder,
  RoundId,
  RoundFinderAll,
} from "@backend/shared/data-access/repositories/rounds.repository";
import { CardsFinder, CardResult } from "@backend/shared/data-access/repositories/cards.repository";
import { TurnsFinder } from "@backend/shared/data-access/repositories/turns.repository";
import { PlayerRole, PLAYER_ROLE, GAME_TYPE, GAME_STATE } from "@codenames/shared/types";
import { GameAggregate } from "./gameplay-state.types";

/**
 * Player context information for the current user
 * todo: review this type (seemd duplicated and other types across gameplay feature for re-usability)
 */
export type PlayerContext = {
  _id: number;
  publicId: string;
  _userId: number;
  _gameId: number;
  _teamId: number;
  teamName: string;
  statusId: number;
  publicName: string;
  role: PlayerRole;
  username?: string;
};

/**
 * Result types for game state lookup
 */
export type GameStateResult =
  | { status: "found"; data: GameAggregate }
  | { status: "game-not-found"; gameId: string }
  | { status: "user-not-player"; gameId: string; userId: number }
  | { status: "player-not-found"; playerId: string }
  | { status: "player-not-in-game"; playerId: string; gameId: string }
  | { status: "user-not-authorized"; userId: number; playerId: string };

/**
 * Type representing the function returned by the provider
 */
export type GameplayStateProvider = (
  gameId: PublicId,
  userId: number,
  playerId?: string | null,
) => Promise<GameStateResult>;

/**
 * Determines the appropriate player context based on game mode and specific player ID
 */
const determinePlayerContext = (
  userPlayers: PlayerResult[],
  specificPlayer: PlayerResult | null,
  gameType: string,
): PlayerContext | null => {
  // If specific player provided, use that player's actual role
  if (specificPlayer) {
    return {
      _id: specificPlayer._id,
      publicId: specificPlayer.publicId,
      _userId: specificPlayer._userId,
      _gameId: specificPlayer._gameId,
      _teamId: specificPlayer._teamId,
      teamName: specificPlayer.teamName,
      statusId: specificPlayer.statusId,
      publicName: specificPlayer.publicName,
      role: specificPlayer.role, // Use assigned role, not calculated!
    };
  }

  // For multi-device mode, always return the user's player context if they have one
  if (gameType === GAME_TYPE.MULTI_DEVICE && userPlayers.length > 0) {
    const userPlayer = userPlayers[0]; // User can only have 1 player in multi-device
    return {
      _id: userPlayer._id,
      publicId: userPlayer.publicId,
      _userId: userPlayer._userId,
      _gameId: userPlayer._gameId,
      _teamId: userPlayer._teamId,
      teamName: userPlayer.teamName,
      statusId: userPlayer.statusId,
      publicName: userPlayer.publicName,
      role: userPlayer.role,
    };
  }

  return null;
};

/**
 * Creates a provider that assembles the complete game state from different data sources
 *
 * @param getGameById - Function to retrieve game data using public ID
 * @param getTeams - Function to retrieve teams for a game
 * @param getCardsByRoundId - Function to retrieve cards for a round
 * @param getTurnsByRoundId - Function to retrieve turns for a round
 * @param getPlayersByGameId - Function to retrieve players for a GAME (not round)
 * @param getLatestRound - Function to retrieve the latest round for a game
 * @param getAllRounds - Function to retrieve all rounds for a game
 * @param getPlayerContext - Function to retrieve player context info
 * @param findPlayerByPublicId - Function to find player by public ID
 * @returns Function that provides the complete game state for a given game ID and user
 */

// todo: difference between game-data-loader and provider?
export const gameplayStateProvider = (
  getGameById: GameFinder<PublicId>,
  getTeams: TeamsFinder<InternalId>,
  getCardsByRoundId: CardsFinder<RoundId>,
  getTurnsByRoundId: TurnsFinder<RoundId>,
  getPlayersByGameId: PlayerFinderAll<InternalId>,
  getLatestRound: RoundFinder<InternalId>,
  getAllRounds: RoundFinderAll<InternalId>,
  getPlayerContext: PlayerContextFinder,
  findPlayerByPublicId: PlayerFinderByPublicId,
): GameplayStateProvider => {
  /**
   * Retrieves and assembles the complete game state for a given game
   *
   * @param gameId - Public identifier of the game
   * @param userId - ID of the user requesting the state
   * @param playerId - Optional specific player ID for player-specific context
   * @returns Complete game state object or error status
   */
  const getGameplayState = async (
    gameId: PublicId,
    userId: number,
    playerId?: string | null,
  ): Promise<GameStateResult> => {
    const game = await getGameById(gameId);
    if (!game) return { status: "game-not-found", gameId };

    let specificPlayer: PlayerResult | null = null;
    if (playerId) {
      specificPlayer = await findPlayerByPublicId(playerId);
      if (!specificPlayer) {
        return { status: "player-not-found", playerId };
      }
      if (specificPlayer._gameId !== game._id) {
        return { status: "player-not-in-game", playerId, gameId };
      }
      // In multi-device mode, user must own the specific player
      if (game.game_type === GAME_TYPE.MULTI_DEVICE && specificPlayer._userId !== userId) {
        return { status: "user-not-authorized", userId, playerId };
      }
    }

    // Collect all game level state - players belong to GAMES not rounds!
    const [teams, allRounds, latestRound, players] = await Promise.all([
      getTeams(game._id),
      getAllRounds(game._id),
      getLatestRound(game._id),
      getPlayersByGameId(game._id),
    ]);

    // Only require player membership for games that are in progress or completed
    // LOBBY games can be viewed by any authenticated user (for multi-device join flow)
    // userId=0 is used for server-side AI checks and bypasses this validation
    const allGamePlayers = await getPlayersByGameId(game._id);
    const userIsPlayer = allGamePlayers.some((p) => p._userId === userId);
    if (!userIsPlayer && game.status !== GAME_STATE.LOBBY && userId !== 0) {
      return { status: "user-not-player", gameId, userId };
    }

    // Get user's players for this game/round (for general context)
    const roundId = latestRound?._id || null;
    const userPlayers = await getPlayerContext(game._id, userId, roundId);

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

    if (!latestRound) {
      const playerContext = determinePlayerContext(
        userPlayers || [],
        specificPlayer,
        game.game_type,
      );

      // playerContext can be null when no specific player is provided - this is valid

      return {
        status: "found",
        data: {
          _id: game._id,
          public_id: game.public_id,
          status: game.status,
          game_type: game.game_type,
          game_format: game.game_format,
          aiMode: game.ai_mode,
          teams: teamsWithPlayers,
          currentRound: null,
          historicalRounds,
          playerContext,
          createdAt: game.created_at,
          updatedAt: game.updated_at,
        },
      };
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

    const playerContext = determinePlayerContext(userPlayers || [], specificPlayer, game.game_type);

    // playerContext can be null when no specific player is provided - this is valid

    return {
      status: "found",
      data: {
        _id: game._id,
        public_id: game.public_id,
        status: game.status,
        game_type: game.game_type,
        game_format: game.game_format,
        aiMode: game.ai_mode,
        teams: teamsWithPlayers,
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
        historicalRounds,
        playerContext,
        createdAt: game.created_at,
        updatedAt: game.updated_at,
      },
    };
  };

  return getGameplayState;
};
