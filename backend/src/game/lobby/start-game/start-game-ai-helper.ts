/**
 * Helper for creating AI bots when starting a game in AI mode
 * Pure business logic - uses repositories instead of direct SQL
 */

import type { LobbyAggregate } from "../state/types";
import { getTeamNameToIdMap } from "../state/helpers";
import type { TransactionalHandler } from "@backend/shared/data-access/transaction-handler";
import type { LobbyOperations } from "../lobby-actions";
import type { UserCreator } from "@backend/shared/data-access/repositories/users.repository";

/** Inputs for the AI-bot seeding pass run at start-game in AI mode. */
export type CreateAIBotsInput = {
  lobby: LobbyAggregate;
  lobbyHandler: TransactionalHandler<LobbyOperations>;
  createUser: UserCreator;
};

/**
 * Creates AI users and player rows for any team short of two players.
 *
 * Idempotent on full teams (skipped when `2 - team.players.length <= 0`).
 * Each bot gets a unique generated username and a display name keyed to
 * its team. Throws if a team's id can't be resolved.
 */
export const createAIBotsForTeams = async (input: CreateAIBotsInput): Promise<void> => {
  const { lobby, lobbyHandler, createUser } = input;

  for (const team of lobby.teams) {
    const playersNeeded = 2 - team.players.length;

    if (playersNeeded <= 0) {
      continue;
    }

    const botUsers: Array<{ userId: number; botName: string }> = [];
    for (let i = 0; i < playersNeeded; i++) {
      const botUser = await createUser({
        username: `AI-Bot-${team.teamName}-${Date.now()}-${i}`,
      });

      botUsers.push({
        userId: botUser._id,
        botName: `AI-${team.teamName.replace("Team ", "")}-Bot${i + 1}`,
      });
    }

    await lobbyHandler(async (lobbyOps) => {
      const teamNameToIdMap = getTeamNameToIdMap(lobby);
      const teamId = teamNameToIdMap.get(team.teamName);

      if (!teamId) {
        throw new Error(`Team ${team.teamName} not found`);
      }

      const playerInputs = botUsers.map((bot) => ({
        userId: bot.userId,
        gameId: lobby._id,
        teamId,
        publicName: bot.botName,
        statusId: 1,
        isAi: true,
      }));

      await lobbyOps.addPlayers(playerInputs);
    });
  }
};
