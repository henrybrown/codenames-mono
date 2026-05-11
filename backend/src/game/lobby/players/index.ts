import type { LobbyAggregateLoader } from "../state";
import type { TransactionalHandler } from "@backend/shared/data-access/transaction-handler";
import type { LobbyOperations } from "../lobby-actions";

import { addPlayersService } from "./add-players.service";
import { addPlayersController } from "./add-players.controller";
import { modifyPlayersService } from "./modify-players.service";
import { modifyPlayersController } from "./modify-players.controller";
import { removePlayersService } from "./remove-players.service";
import { removePlayersController } from "./remove-players.controller";

export interface PlayersDependencies {
  loadLobbyAggregate: LobbyAggregateLoader;
  lobbyHandler: TransactionalHandler<LobbyOperations>;
}

export const createPlayers = (deps: PlayersDependencies) => {
  const addService = addPlayersService({
    lobbyHandler: deps.lobbyHandler,
    loadLobbyAggregate: deps.loadLobbyAggregate,
  });
  const addController = addPlayersController({ addPlayers: addService });

  const modifyService = modifyPlayersService({
    lobbyHandler: deps.lobbyHandler,
    loadLobbyAggregate: deps.loadLobbyAggregate,
  });
  const { controllers: modifyController } = modifyPlayersController({
    modifyPlayersService: modifyService,
  });

  const removeService = removePlayersService({
    lobbyHandler: deps.lobbyHandler,
    loadLobbyAggregate: deps.loadLobbyAggregate,
  });
  const removeController = removePlayersController({
    removePlayersService: removeService,
  });

  return {
    controllers: {
      add: addController,
      modify: modifyController,
      remove: removeController,
    },
  };
};
