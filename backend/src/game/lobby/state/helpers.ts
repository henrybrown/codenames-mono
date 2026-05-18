import { LobbyAggregate } from "./types";

type LobbyPlayer = LobbyAggregate["teams"][0]["players"][0];

/**
 * Pure helpers for working with a loaded LobbyAggregate.
 *
 * No async, no DB access — all inputs are values, all outputs are values.
 */

/** Total players across all teams in the lobby. */
export const getTotalPlayerCount = (lobby: LobbyAggregate): number =>
  lobby.teams.reduce((total, team) => total + team.players.length, 0);

/** Player counts per team, in team order. */
export const getTeamPlayerCounts = (lobby: LobbyAggregate): number[] =>
  lobby.teams.map((team) => team.players.length);

/** The requesting user's player record, or null if not in the lobby. */
export const getUserPlayer = (lobby: LobbyAggregate): LobbyPlayer | null => {
  for (const team of lobby.teams) {
    const userPlayer = team.players.find(
      (player) => player._userId === lobby.userContext._userId,
    );
    if (userPlayer) return userPlayer;
  }
  return null;
};

/** Find a player by their public id, or null if not found. */
export const getPlayerByPublicId = (
  lobby: LobbyAggregate,
  publicId: string,
): LobbyPlayer | null => {
  for (const team of lobby.teams) {
    const player = team.players.find((p) => p.publicId === publicId);
    if (player) return player;
  }
  return null;
};

/** Is the requesting user the owner of the given player record? */
export const isPlayerOwner = (
  lobby: LobbyAggregate,
  playerId: string,
): boolean => {
  const player = getPlayerByPublicId(lobby, playerId);
  return player?._userId === lobby.userContext._userId;
};

/** Map of team name → internal team id. */
export const getTeamNameToIdMap = (lobby: LobbyAggregate): Map<string, number> => {
  const teamMap = new Map<string, number>();
  lobby.teams.forEach((team) => {
    teamMap.set(team.teamName, team._id);
  });
  return teamMap;
};

/** All team names in the lobby, in team order. */
export const getAvailableTeamNames = (lobby: LobbyAggregate): string[] =>
  lobby.teams.map((team) => team.teamName);
