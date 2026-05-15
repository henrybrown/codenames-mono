import type { GameAggregateLoader } from "@backend/game/state/load-game-aggregate";
import { isUserPlayerInGame } from "@backend/game/access";
import { PlayerRole, PLAYER_ROLE } from "@codenames/shared/types";

export type PlayerStatus = "ACTIVE" | "WAITING";

export type PublicPlayerInfo = {
  publicId: string;
  name: string;
  teamName: string;
  role: PlayerRole;
  status: PlayerStatus;
};

export type GetPlayersResult =
  | { status: "found"; data: PublicPlayerInfo[] }
  | { status: "game-not-found" }
  | { status: "user-not-in-game" };

export type GetPlayersService = (
  gameId: string,
  userId: number,
) => Promise<GetPlayersResult>;

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
