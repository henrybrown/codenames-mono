import type { GameAggregateLoader } from "@backend/game/gameplay/state/load-game-aggregate";
import { isUserPlayerInGame } from "@backend/game/access";
import { PlayerRole, PLAYER_ROLE } from "@codenames/shared/types";

/**
 * Player status based on current game state
 */
export type PlayerStatus = "ACTIVE" | "WAITING";

/**
 * Public player information with status
 */
export type PublicPlayerInfo = {
  publicId: string;
  name: string;
  teamName: string;
  role: PlayerRole;
  status: PlayerStatus;
};

/**
 * Service result types
 */
export type GetPlayersResult =
  | { status: "found"; data: PublicPlayerInfo[] }
  | { status: "game-not-found" }
  | { status: "user-not-in-game" };

/**
 * Service function type
 */
export type GetPlayersService = (
  gameId: string,
  userId: number,
) => Promise<GetPlayersResult>;

/**
 * Dependencies for the service
 */
export type GetPlayersServiceDependencies = {
  loadGameAggregate: GameAggregateLoader;
};

/**
 * Determines if a player should be active based on game state
 */
const determinePlayerStatus = (
  player: any,
  gameState: any,
): PlayerStatus => {
  // If no current round, no one is active
  if (!gameState.currentRound) {
    return "WAITING";
  }

  // Find active turn
  const activeTurn = gameState.currentRound.turns?.find(
    (turn: any) => turn.status === "ACTIVE"
  );

  if (!activeTurn) {
    return "WAITING";
  }

  // Determine which role should be active
  const shouldCodemasterBeActive = !activeTurn.clue;
  const shouldCodebreakerBeActive = !!activeTurn.clue;

  // Check if this player should be active
  const isRightTeam = player._teamId === activeTurn._teamId;
  const isRightRole =
    (shouldCodemasterBeActive && player.role === PLAYER_ROLE.CODEMASTER) ||
    (shouldCodebreakerBeActive && player.role === PLAYER_ROLE.CODEBREAKER);

  return isRightTeam && isRightRole ? "ACTIVE" : "WAITING";
};

/**
 * Creates the get players service
 */
export const createGetPlayersService = (
  deps: GetPlayersServiceDependencies,
): GetPlayersService => {
  return async (gameId: string, userId: number): Promise<GetPlayersResult> => {
    const aggregate = await deps.loadGameAggregate(gameId);
    if (!aggregate) {
      return { status: "game-not-found" };
    }

    if (!isUserPlayerInGame(aggregate, userId)) {
      return { status: "user-not-in-game" };
    }

    // Collect all players from all teams
    const allPlayers = aggregate.teams.flatMap(team =>
      team.players.map(player => ({ ...player, teamName: team.teamName }))
    );

    // Transform to public format with status
    const publicPlayers: PublicPlayerInfo[] = allPlayers.map(player => ({
      publicId: player.publicId,
      name: player.publicName,
      teamName: player.teamName,
      role: player.role as PlayerRole,
      status: determinePlayerStatus(player, aggregate),
    }));

    return {
      status: "found",
      data: publicPlayers,
    };
  };
};
