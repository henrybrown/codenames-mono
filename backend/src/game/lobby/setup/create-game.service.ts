import shortid from "shortid";
import { UnexpectedSetupError } from "./errors/setup.errors";
import { GameType, GameFormat, GAME_TYPE } from "@codenames/shared/types";
import type { TransactionalHandler } from "@backend/shared/data-access/transaction-handler";
import type { SetupOperations } from "./setup-actions";

export type GameCreationResult = {
  _id: number;
  publicId: string;
  createdAt: Date;
  teams: string[];
  adminPlayer?: {
    publicId: string;
    playerName: string;
    teamName: string;
  };
};

export type ServiceDependencies = {
  setupHandler: TransactionalHandler<SetupOperations>;
};

export const createGameService = (dependencies: ServiceDependencies) => {
  /**
   * Generates a public ID for the game.
   *
   * shortid produces collision-resistant IDs (default alphabet × 7
   * chars ≈ 64^7 keyspace). If a collision against an existing DB
   * row does occur, the transactional check below (`getGame(publicId)`)
   * surfaces it as UnexpectedSetupError → 500 and the client retries.
   * No app-level retry loop here — the previous one was dead code
   * (`for { return publicId; }` returned on the first iteration).
   */
  const generateUniquePublicId = (): string => shortid.generate();

  return async (
    gameType: GameType,
    gameFormat: GameFormat,
    userId: number,
    aiMode: boolean = false,
  ): Promise<GameCreationResult> => {
    const publicId = generateUniquePublicId();

    return await dependencies.setupHandler(async (setupOps) => {
      const existingGame = await setupOps.getGame(publicId);
      if (existingGame) {
        throw new UnexpectedSetupError(
          `Game ID collision detected: ${publicId}`,
        );
      }

      const game = await setupOps.createGame({
        publicId,
        gameType,
        gameFormat,
        aiMode,
        hostUserId: userId,
      });

      const teams = await setupOps.createTeams({
        gameId: game._id,
        teamNames: ["Team Red", "Team Blue"],
      });

      const uniqueTeamNames = [...new Set(teams.map((team) => team.teamName))];

      return {
        _id: game._id,
        publicId,
        createdAt: game.created_at,
        teams: uniqueTeamNames,
      };
    });
  };
};
