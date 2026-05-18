import type { LobbyAggregateLoader } from "../state";
import type { TransactionalHandler } from "@backend/shared/data-access/transaction-handler";
import type { LobbyOperations } from "../lobby-actions";

import { roundCreationService } from "./new-round.service";
import { newRoundController } from "./new-round.controller";
import { dealCardsService } from "./deal-cards.service";
import { dealCardsController } from "./deal-cards.controller";
import { startRoundService } from "./start-round.service";
import { startRoundController } from "./start-round.controller";

/** Wiring dependencies for the lobby rounds sub-feature. */
export interface RoundsDependencies {
  loadLobbyAggregate: LobbyAggregateLoader;
  lobbyHandler: TransactionalHandler<LobbyOperations>;
}

/** Builds the rounds sub-feature — new-round, deal-cards, start-round. */
export const createRounds = (deps: RoundsDependencies) => {
  const newRoundService = roundCreationService({
    loadLobbyAggregate: deps.loadLobbyAggregate,
    lobbyHandler: deps.lobbyHandler,
  });
  const newRound = newRoundController({ createRound: newRoundService });

  const dealService = dealCardsService({
    loadLobbyAggregate: deps.loadLobbyAggregate,
    lobbyHandler: deps.lobbyHandler,
  });
  const dealCards = dealCardsController({ dealCards: dealService });

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
