import { GameAggregate, TurnPhase } from "@backend/game/gameplay/state/gameplay-state.types";
import { PLAYER_ROLE, PlayerRole, ROUND_STATE } from "@codenames/shared/types";
import { GameplayStateProvider } from "@backend/game/gameplay/state/gameplay-state.provider";
import { GameDataLoader } from "@backend/game/gameplay/state/load-game-aggregate";
import { computeTurnPhase } from "@backend/game/gameplay/state/gameplay-state.helpers";
import type { AppLogger } from "@backend/shared/logging";

/**
 * Service input parameters
 */
export type GetGameStateInput = {
  gameId: string;
  userId: number;
  playerId: string | null;
  role: "CODEMASTER" | "CODEBREAKER" | null;
};

export type GetGameStateResult =
  | { success: true; data: PublicGameStateResponse }
  | { success: false; error: GetGameStateFailure };

/**
 * Public API response structure
 */
export type PublicGameStateResponse = {
  publicId: string;
  status: string;
  gameType: string;
  gameFormat: string;
  aiMode: boolean;
  createdAt: Date;
  teams: {
    name: string;
    score: number;
    players: {
      publicId: string;
      name: string;
      isActive: boolean;
      username?: string;
    }[];
  }[];
  currentRound: {
    roundNumber: number;
    status: string;
    winningTeamName?: string | null;
    cards: {
      word: string;
      selected: boolean;
      teamName?: string | null;
      cardType?: string;
    }[];
    turns: {
      id: string;
      teamName: string;
      status: string;
      guessesRemaining: number;
      clue?: { word: string; number: number };
      guesses: {
        cardWord: string;
        playerName: string;
        outcome: string | null;
      }[];
      active: TurnPhase | null;
    }[];
  } | null;
  playerContext: {
    publicId: string;
    playerName: string;
    teamName: string;
    role: PlayerRole;
  } | null;
};

/**
 * Error types for the service
 */
export const GAME_STATE_ERROR = {
  GAME_NOT_FOUND: "game-not-found",
  UNAUTHORIZED: "unauthorized",
  PLAYER_NOT_FOUND: "player-not-found",
  PLAYER_NOT_IN_GAME: "player-not-in-game",
} as const;

/**
 * Response types
 */
export type GetGameStateFailure =
  | { status: typeof GAME_STATE_ERROR.GAME_NOT_FOUND; gameId: string }
  | { status: typeof GAME_STATE_ERROR.UNAUTHORIZED; userId: number }
  | { status: typeof GAME_STATE_ERROR.PLAYER_NOT_FOUND; playerId: string }
  | { status: typeof GAME_STATE_ERROR.PLAYER_NOT_IN_GAME; playerId: string; gameId: string };

/**
 * Dependencies required by the service
 */
export type GetGameStateDependencies = {
  getGameState: GameplayStateProvider;
  loadGameData: GameDataLoader;
};

/**
 * Creates a service for retrieving role-specific game state
 */
export const getGameStateService = (logger: AppLogger) => (dependencies: GetGameStateDependencies) => {
  return async (input: GetGameStateInput): Promise<GetGameStateResult> => {
    // When role is provided (single-device), use the auth-free loader + role resolution
    if (input.role) {
      const gameState = await dependencies.loadGameData(input.gameId);
      if (!gameState) {
        return { success: false, error: { status: GAME_STATE_ERROR.GAME_NOT_FOUND, gameId: input.gameId } };
      }

      // Verify userId is a player
      const allPlayers = gameState.teams.flatMap((t) => t.players ?? []);
      const userIsPlayer = allPlayers.some((p) => p._userId === input.userId);
      if (!userIsPlayer) {
        return { success: false, error: { status: GAME_STATE_ERROR.UNAUTHORIZED, userId: input.userId } };
      }

      // Find active turn to determine team, then find player with role
      const activeTurn = gameState.currentRound?.turns?.find((t) => t.status === "ACTIVE");
      if (activeTurn) {
        const roundPlayers = gameState.currentRound?.players ?? [];
        const matchingPlayer = roundPlayers.find(
          (p) => p._teamId === activeTurn._teamId && p.role === input.role,
        );
        if (matchingPlayer) {
          const stateWithContext = {
            ...gameState,
            playerContext: {
              _id: matchingPlayer._id,
              publicId: matchingPlayer.publicId,
              _userId: matchingPlayer._userId,
              _gameId: matchingPlayer._gameId,
              _teamId: matchingPlayer._teamId,
              teamName: matchingPlayer.teamName,
              statusId: matchingPlayer.statusId,
              publicName: matchingPlayer.publicName,
              role: matchingPlayer.role as typeof PLAYER_ROLE.CODEMASTER | typeof PLAYER_ROLE.CODEBREAKER,
            },
          };
          return { success: true, data: transformGameState(stateWithContext) };
        }
      }

      // No active turn or no matching player — return without playerContext
      return { success: true, data: transformGameState(gameState) };
    }

    // Standard path: use the auth-aware provider
    const result = await dependencies.getGameState(input.gameId, input.userId, input.playerId);

    if (result.status === "game-not-found") {
      return { success: false, error: { status: GAME_STATE_ERROR.GAME_NOT_FOUND, gameId: input.gameId } };
    }
    if (result.status === "user-not-player") {
      return { success: false, error: { status: GAME_STATE_ERROR.UNAUTHORIZED, userId: input.userId } };
    }
    if (result.status === "player-not-found") {
      return { success: false, error: { status: GAME_STATE_ERROR.PLAYER_NOT_FOUND, playerId: input.playerId! } };
    }
    if (result.status === "player-not-in-game") {
      return { success: false, error: { status: GAME_STATE_ERROR.PLAYER_NOT_IN_GAME, playerId: input.playerId!, gameId: input.gameId } };
    }
    if (result.status === "user-not-authorized") {
      return { success: false, error: { status: GAME_STATE_ERROR.UNAUTHORIZED, userId: input.userId } };
    }

    return { success: true, data: transformGameState(result.data) };
  };
};

/**
 * Transforms the internal game state to the public API format
 */
function transformGameState(gameData: GameAggregate): PublicGameStateResponse {
  const playerRole = gameData.playerContext?.role || PLAYER_ROLE.NONE;

  return {
    publicId: gameData.public_id,
    status: gameData.status,
    gameType: gameData.game_type,
    gameFormat: gameData.game_format,
    aiMode: gameData.aiMode,
    createdAt: gameData.createdAt,

    teams: gameData.teams.map((team) => ({
      name: team.teamName,
      score: 0,
      players: team.players.map((player) => ({
        publicId: player.publicId,
        name: player.publicName,
        isActive: player.statusId === 1,
        username: player.publicName,
      })),
    })),

    currentRound: gameData.currentRound
      ? {
          roundNumber: gameData.currentRound.number,
          status: gameData.currentRound.status,
          winningTeamName: gameData.currentRound.winningTeamName,
          cards: gameData.currentRound.cards.map((card) =>
            applyCardVisibility(card, playerRole, gameData.currentRound!.status),
          ),
          turns: gameData.currentRound.turns.map((turn) => ({
            id: turn.publicId,
            teamName: turn.teamName,
            status: turn.status,
            guessesRemaining: turn.guessesRemaining,
            clue: turn.clue
              ? { word: turn.clue.word, number: turn.clue.number }
              : undefined,
            guesses: turn.guesses.map((guess) => ({
              cardWord: guess.cardWord,
              playerName: guess.playerName,
              outcome: guess.outcome,
            })),
            active: computeTurnPhase(turn, gameData.currentRound!.players),
          })),
        }
      : null,

    playerContext: gameData.playerContext
      ? {
          publicId: gameData.playerContext.publicId,
          playerName: gameData.playerContext.publicName,
          teamName: gameData.playerContext.teamName,
          role: gameData.playerContext.role,
        }
      : null,
  };
}

/**
 * Applies visibility rules to a card based on player role and round status
 */
function applyCardVisibility(card: any, playerRole: PlayerRole, roundStatus: string) {
  const baseCard = {
    word: card.word,
    selected: card.selected,
  };

  if (
    playerRole === PLAYER_ROLE.CODEMASTER ||
    card.selected ||
    roundStatus === ROUND_STATE.COMPLETED
  ) {
    return {
      ...baseCard,
      teamName: card.teamName,
      cardType: card.cardType,
    };
  }

  return baseCard;
}
