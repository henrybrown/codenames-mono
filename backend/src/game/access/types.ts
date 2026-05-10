import type { PlayerRole } from "@codenames/shared/types";

/**
 * The user's player record in a game.
 *
 * Returned by access/helpers when finding a player in an aggregate.
 * Slimmer than the full PlayerResult — has only what action services
 * need to attribute work and decide what's visible.
 */
export type GamePlayer = {
  _id: number;
  publicId: string;
  _userId: number;
  _teamId: number;
  publicName: string;
  teamName: string;
  role: PlayerRole;
};
