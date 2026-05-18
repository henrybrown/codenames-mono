import type { GameAggregateLoader } from "@backend/game/state/load-game-aggregate";
import { isUserPlayerInGame } from "@backend/game/access";
import { PlayerRole, PLAYER_ROLE } from "@codenames/shared/types";

/** A player is ACTIVE when it's their turn to act, otherwise WAITING. */
export type PlayerStatus = "ACTIVE" | "WAITING";

/** Player projection exposed by the get-players API. */
export type PublicPlayerInfo = {
  publicId: string;
  name: string;
  teamName: string;
  role: PlayerRole;
  status: PlayerStatus;
};

/** Tagged result for the get-players service. */
export type GetPlayersResult =
  | { status: "found"; data: PublicPlayerInfo[] }
  | { status: "game-not-found" }
  | { status: "user-not-in-game" };

/** Service-call signature for fetching the player roster. */
export type GetPlayersService = (
  gameId: string,
  userId: number,
) => Promise<GetPlayersResult>;

/** Wiring dependencies for the get-players service. */
export type GetPlayersServiceDependencies = {
  loadGameAggregate: GameAggregateLoader;
};

const determinePlayerStatus = (
  player: any,
  gameState: any,
): PlayerStatus => {
  if (!gameState.currentRound) {
    return "WAITING";
  }

  const activeTurn = gameState.currentRound.turns?.find(
    (turn: any) => turn.status === "ACTIVE"
  );

  if (!activeTurn) {
    return "WAITING";
  }

  const shouldCodemasterBeActive = !activeTurn.clue;
  const shouldCodebreakerBeActive = !!activeTurn.clue;

  const isRightTeam = player._teamId === activeTurn._teamId;
  const isRightRole =
    (shouldCodemasterBeActive && player.role === PLAYER_ROLE.CODEMASTER) ||
    (shouldCodebreakerBeActive && player.role === PLAYER_ROLE.CODEBREAKER);

  return isRightTeam && isRightRole ? "ACTIVE" : "WAITING";
};

/**
 * Builds the get-players service.
 *
 * Loads the game, verifies user membership, then projects each player
 * with their derived ACTIVE/WAITING status based on whose turn it is.
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

    const allPlayers = aggregate.teams.flatMap(team =>
      team.players.map(player => ({ ...player, teamName: team.teamName }))
    );

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
