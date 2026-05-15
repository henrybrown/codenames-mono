import { GameAggregate, TurnPhase } from "@backend/game/state/types";
import { PLAYER_ROLE, PlayerRole, ROUND_STATE, GAME_TYPE } from "@codenames/shared/types";
import type { GameAggregateLoader } from "@backend/game/state/load-game-aggregate";
import { computeTurnPhase } from "@backend/game/state/helpers";
import {
  findPlayerByUserId,
  findPlayerByPublicId,
  findPlayerByActiveRole,
  type GamePlayer,
} from "@backend/game/access";
import type { AppLogger } from "@backend/shared/logging";

export type GetGameStateInput = {
  gameId: string;
  userId: number;
  playerId: string | null;
  role: "CODEMASTER" | "CODEBREAKER" | null;
};

export type GetGameStateResult =
  | { success: true; data: PublicGameStateResponse }
  | { success: false; message: string; notFound?: boolean };

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

export type GetGameStateDependencies = {
  loadGameAggregate: GameAggregateLoader;
};

export const getGameStateService = (logger: AppLogger) => (deps: GetGameStateDependencies) => {
  return async (input: GetGameStateInput): Promise<GetGameStateResult> => {
    const aggregate = await deps.loadGameAggregate(input.gameId);
    if (!aggregate) {
      return {
        success: false,
        notFound: true,
        message: `Game ${input.gameId} not found`,
      };
    }

    // Resolve the player context for the response. Three cases:
    //   - role provided     -> active-turn role lookup (single-device)
    //   - playerId provided -> direct lookup by public id (multi-device)
    //   - neither           -> identify by userId (spectator/multi-device user)
    let playerContext: GamePlayer | null = null;

    if (input.role) {
      playerContext = findPlayerByActiveRole(aggregate, input.role);
      // null is fine — single-device between turns has no active role; treat as spectator
    } else if (input.playerId) {
      playerContext = findPlayerByPublicId(aggregate, input.playerId);
      if (!playerContext) {
        return {
          success: false,
          notFound: true,
          message: `Player ${input.playerId} not found`,
        };
      }
      // For multi-device, ensure the user owns the player they specified.
      if (
        aggregate.game_type === GAME_TYPE.MULTI_DEVICE &&
        playerContext._userId !== input.userId
      ) {
        // Treat as spectator instead of erroring — the user can't act as
        // someone else, but they can view the game.
        playerContext = null;
      }
    } else {
      // No specific identifier — find the user's own player if they have one.
      playerContext = findPlayerByUserId(aggregate, input.userId);
    }

    return { success: true, data: transformGameState(aggregate, playerContext) };
  };
};

function transformGameState(
  aggregate: GameAggregate,
  playerContext: GamePlayer | null,
): PublicGameStateResponse {
  const playerRole = playerContext?.role ?? PLAYER_ROLE.NONE;

  return {
    publicId: aggregate.public_id,
    status: aggregate.status,
    gameType: aggregate.game_type,
    gameFormat: aggregate.game_format,
    aiMode: aggregate.aiMode,
    createdAt: aggregate.createdAt,

    teams: aggregate.teams.map((team) => ({
      name: team.teamName,
      score: 0,
      players: team.players.map((player) => ({
        publicId: player.publicId,
        name: player.publicName,
        isActive: player.statusId === 1,
        username: player.publicName,
      })),
    })),

    currentRound: aggregate.currentRound
      ? {
          roundNumber: aggregate.currentRound.number,
          status: aggregate.currentRound.status,
          winningTeamName: aggregate.currentRound.winningTeamName,
          cards: aggregate.currentRound.cards.map((card) =>
            applyCardVisibility(card, playerRole, aggregate.currentRound!.status),
          ),
          turns: aggregate.currentRound.turns.map((turn) => ({
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
            active: computeTurnPhase(turn, aggregate.currentRound!.players),
          })),
        }
      : null,

    playerContext: playerContext
      ? {
          publicId: playerContext.publicId,
          playerName: playerContext.publicName,
          teamName: playerContext.teamName,
          role: playerContext.role,
        }
      : null,
  };
}

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
