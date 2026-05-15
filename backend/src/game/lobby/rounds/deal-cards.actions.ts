import {
  RandomWordsSelector,
  CardsCreator,
  CardInput,
  CARD_TYPE,
  CardType,
} from "@backend/shared/data-access/repositories/cards.repository";
import type { TeamId } from "@backend/shared/data-access/repositories/teams.repository";
import type { CreateEventInput } from "@backend/shared/data-access/repositories/game-events.repository";
import { GAME_EVENT_TYPE } from "@codenames/shared/types";

import type { DealCardsValidLobbyState } from "./deal-cards.rules";

export const dealCardsToRound = (
  getRandomWords: RandomWordsSelector,
  replaceCards: CardsCreator,
  createEvent: (event: CreateEventInput) => Promise<any>,
) => {
  return async (gameState: DealCardsValidLobbyState) => {
    const [team1, team2] = gameState.teams;

    const startsFirst = Math.random() > 0.5;
    const [startingTeam, otherTeam] = startsFirst ? [team1._id, team2._id] : [team2._id, team1._id];

    const cardsWithoutWords = allocateInitialCardTypes(startingTeam, otherTeam);
    const shuffledCards = shuffleCards(cardsWithoutWords);

    // Get current words to exclude (if redealing)
    const currentWords = gameState.currentRound.cards?.map((c) => c.word) || [];

    const words = await getRandomWords(shuffledCards.length, "BASE", "en", currentWords);

    const cardInputs: CardInput[] = words.map((word, position) => ({
      word,
      cardType: shuffledCards[position].cardType,
      teamId: shuffledCards[position].teamId,
    }));

    const cards = await replaceCards(gameState.currentRound._id, cardInputs);

    await createEvent({
      gameId: gameState._id,
      eventType: GAME_EVENT_TYPE.DEAL,
      roundId: gameState.currentRound._id,
      metadata: {
        cardIds: cards.map((c) => c._id),
        startingTeam,
        otherTeam,
      },
    });

    return {
      _roundId: gameState.currentRound._id,
      roundNumber: gameState.currentRound.number,
      startingTeam,
      otherTeam,
      cards,
    };
  };
};

type CardInfo = {
  cardType: CardType;
  teamId?: TeamId;
};

/**
 * Generic Fisher-Yates shuffle that works with any array type
 */
const shuffleCards = <T>(items: T[]): T[] => {
  const shuffled = [...items];

  for (let currentPos = shuffled.length - 1; currentPos > 0; currentPos--) {
    const swapPos = Math.floor(Math.random() * (currentPos + 1));
    [shuffled[currentPos], shuffled[swapPos]] = [shuffled[swapPos], shuffled[currentPos]];
  }

  return shuffled;
};

/**
 * Allocates the initial card type distribution before shuffling
 * - Starting team: 9 cards
 * - Other team: 8 cards
 * - Assassin: 1 card
 * - Bystander: 7 cards
 * Total: 25 cards
 */
export const allocateInitialCardTypes = (startingTeam: TeamId, otherTeam: TeamId): CardInfo[] => [
  ...Array(9).fill({ cardType: CARD_TYPE.TEAM, teamId: startingTeam }),
  ...Array(8).fill({ cardType: CARD_TYPE.TEAM, teamId: otherTeam }),
  { cardType: CARD_TYPE.ASSASSIN },
  ...Array(7).fill({ cardType: CARD_TYPE.BYSTANDER }),
];

export type CardDealer = ReturnType<typeof dealCardsToRound>;
