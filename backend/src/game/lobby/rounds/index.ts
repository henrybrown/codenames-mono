import type { LobbyAggregateLoader } from "../state";
import type { TransactionalHandler } from "@backend/shared/data-access/transaction-handler";
import type { LobbyOperations } from "../lobby-actions";

import { roundCreationService } from "./new-round.service";
import { newRoundController } from "./new-round.controller";
import { dealCardsService } from "./deal-cards.service";
import { dealCardsController } from "./deal-cards.controller";
import { startRoundService } from "./start-round.service";
import { startRoundController } from "./start-round.controller";

export interface RoundsDependencies {
  loadLobbyAggregate: LobbyAggregateLoader;
  lobbyHandler: TransactionalHandler<LobbyOperations>;
}

export const createRounds = (deps: RoundsDependencies) => {
  /** New round */
  const newRoundService = roundCreationService({
    loadLobbyAggregate: deps.loadLobbyAggregate,
    lobbyHandler: deps.lobbyHandler,
  });
  const newRound = newRoundController({ createRound: newRoundService });

  /** Deal cards */
  const dealService = dealCardsService({
    loadLobbyAggregate: deps.loadLobbyAggregate,
    lobbyHandler: deps.lobbyHandler,
  });
  const dealCards = dealCardsController({ dealCards: dealService });

  /** Start round */
  const startService = startRoundService({
    loadLobbyAggregate: deps.loadLobbyAggregate,
    lobbyHandler: deps.lobbyHandler,
  });
  const startRound = startRoundController({ startRound: startService });

  return {
    controllers: {
      newRound,
      dealCards,
      startRound,
    },
  };
};
