import { GameAggregate, TurnPhase } from "@backend/game/gameplay/state/gameplay-state.types";
import { PLAYER_ROLE, PlayerRole, ROUND_STATE } from "@codenames/shared/types";
import type { GameplayStateProvider } from "@backend/game/gameplay/state/get-gameplay-state";
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
} as const;

/**
 * Response types
 */
export type GetGameStateFailure =
  | { status: typeof GAME_STATE_ERROR.GAME_NOT_FOUND; gameId: string }
  | { status: typeof GAME_STATE_ERROR.UNAUTHORIZED; userId: number }
  | { status: typeof GAME_STATE_ERROR.PLAYER_NOT_FOUND; playerId: string };

/**
 * Dependencies required by the service
 */
export type GetGameStateDependencies = {
  getGameplayState: GameplayStateProvider;
};

/**
 * Creates a service for retrieving role-specific game state
 */
export const getGameStateService = (logger: AppLogger) => (dependencies: GetGameStateDependencies) => {
  return async (input: GetGameStateInput): Promise<GetGameStateResult> => {
    const result = await dependencies.getGameplayState(
      input.role
        ? { gameId: input.gameId, userId: input.userId, role: input.role }
        : input.playerId
        ? { gameId: input.gameId, userId: input.userId, playerId: input.playerId }
        : { gameId: input.gameId, userId: input.userId },
    );

    switch (result.status) {
      case "found":
        return { success: true, data: transformGameState(result.data) };
      case "game-not-found":
        return {
          success: false,
          error: { status: GAME_STATE_ERROR.GAME_NOT_FOUND, gameId: input.gameId },
        };
      case "user-not-in-game":
        return {
          success: false,
          error: { status: GAME_STATE_ERROR.UNAUTHORIZED, userId: input.userId },
        };
      case "player-not-found":
        return {
          success: false,
          error: { status: GAME_STATE_ERROR.PLAYER_NOT_FOUND, playerId: input.playerId! },
        };
      case "user-not-authorized":
        return {
          success: false,
          error: { status: GAME_STATE_ERROR.UNAUTHORIZED, userId: input.userId },
        };
      case "no-active-turn":
      case "no-player-for-role": {
        // Old behaviour returned the loaded state without playerContext when
        // there was no active turn / no player for role on the role path.
        // Re-fetch with byUser to surface the data without role-resolution.
        const fallback = await dependencies.getGameplayState({
          gameId: input.gameId,
          userId: input.userId,
        });
        if (fallback.status === "found") {
          return { success: true, data: transformGameState(fallback.data) };
        }
        return {
          success: false,
          error: { status: GAME_STATE_ERROR.GAME_NOT_FOUND, gameId: input.gameId },
        };
      }
    }
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
