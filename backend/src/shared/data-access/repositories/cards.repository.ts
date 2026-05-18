import { Kysely, sql } from "kysely";
import { DB } from "../../db/db.types";
import { UnexpectedRepositoryError } from "./repository.errors";

/** Card primary-key id. */
export type CardId = number;
/** Round primary-key id. */
export type RoundId = number;
/** Team primary-key id. */
export type TeamId = number;
/** Deck primary-key id. */
export type DeckId = number;

/** The three card-type tags used in codenames. */
export const CARD_TYPE = {
  TEAM: "TEAM",
  BYSTANDER: "BYSTANDER",
  ASSASSIN: "ASSASSIN",
} as const;

/** Card-type discriminant — TEAM, BYSTANDER, or ASSASSIN. */
export type CardType = (typeof CARD_TYPE)[keyof typeof CARD_TYPE];

/** Raw DB row shape for the cards table. */
export type CardData = {
  _id: number;
  _round_id: number;
  _team_id: number | null;
  teamName: string | null;
  selected: boolean;
  word: string;
  card_type: CardType;
};

/**
 * Input for inserting a card.
 *
 * `teamId` is required for `TEAM` cards and rejected for the others —
 * `createCards` enforces both with an explicit pre-insert check.
 */
export type CardInput = {
  word: string;
  cardType: CardType;
  teamId?: number; // Optional, required only for TEAM cards
};

/** Service-layer projection of a card row joined with its team. */
export type CardResult = {
  _id: number;
  _roundId: number;
  word: string;
  cardType: CardType;
  _teamId: number | null;
  teamName: string | null;
  selected: boolean;
};

/** Lookup-by-round signature returning all cards. */
export type CardsFinder<T extends RoundId> = (
  identifier: T,
) => Promise<CardResult[]>;

/** Signature for bulk-creating (or replacing) cards on a round. */
export type CardsCreator = (
  roundId: number,
  cards: CardInput[],
) => Promise<CardResult[]>;

/** Signature for partial-updating cards by id (currently just `selected`). */
export type CardUpdater = (
  cardIds: CardId[],
  updates: { selected?: boolean },
) => Promise<CardResult[]>;

/**
 * Signature for fetching N random words from a deck.
 *
 * `excludeWords` is used during redeals so a re-shuffled board doesn't
 * reuse the previous words.
 */
export type RandomWordsSelector = (
  count: number,
  deck?: string,
  languageCode?: string,
  excludeWords?: string[],
) => Promise<string[]>;

// SQL expression for team name lookup - kept simple and contained
const teamNameLookup =
  sql<string>`(SELECT team_name FROM teams WHERE teams.id = cards.team_id)`.as(
    "team_name",
  );

/** Builds a finder returning all cards for a round, in stable id order. */
export const getCardsByRoundId =
  (db: Kysely<DB>): CardsFinder<RoundId> =>
  async (roundId) => {
    const cards = await db
      .selectFrom("cards")
      .leftJoin("teams", "cards.team_id", "teams.id")
      .where("cards.round_id", "=", roundId)
      .select([
        "cards.id",
        "cards.round_id",
        "cards.word",
        "cards.card_type",
        "cards.team_id",
        "cards.selected",
        "teams.team_name",
      ])
      .orderBy("cards.id", "asc")
      .execute();

    return cards.map((card) => ({
      _id: card.id,
      _roundId: card.round_id,
      _teamId: card.team_id,
      teamName: card.team_name,
      word: card.word,
      cardType: card.card_type as CardType,
      selected: card.selected,
    }));
  };

/**
 * Builds a creator for inserting cards on a round.
 *
 * Pre-validates that TEAM cards carry a `teamId` and non-TEAM cards don't —
 * both throw `UnexpectedRepositoryError` before the insert runs.
 */
export const createCards =
  (db: Kysely<DB>): CardsCreator =>
  async (roundId, cards) => {
    if (cards.length === 0) {
      return [];
    }

    try {
      for (const card of cards) {
        if (card.cardType === CARD_TYPE.TEAM && !card.teamId) {
          throw new UnexpectedRepositoryError(
            `Team card "${card.word}" must have a teamId`,
          );
        }
        if (card.cardType !== CARD_TYPE.TEAM && card.teamId) {
          throw new UnexpectedRepositoryError(
            `Non-team card "${card.word}" cannot have a teamId`,
          );
        }
      }

      const values = cards.map((card) => ({
        round_id: roundId,
        word: card.word,
        card_type: card.cardType,
        team_id: card.teamId || null,
        selected: false,
      }));

      // Use raw SQL to get the team names in the returning clause
      const insertedCards = await db
        .insertInto("cards")
        .values(values)
        .returning([
          "id",
          "round_id",
          "word",
          "card_type",
          "team_id",
          "selected",
          teamNameLookup,
        ])
        .execute();

      return insertedCards.map((card) => ({
        _id: card.id,
        _roundId: card.round_id,
        _teamId: card.team_id,
        teamName: card.team_name,
        word: card.word,
        cardType: card.card_type as CardType,
        selected: card.selected,
      }));
    } catch (error) {
      if (error instanceof UnexpectedRepositoryError) {
        throw error;
      }
      throw new UnexpectedRepositoryError(
        `Failed to create cards for round ${roundId}.`,
        {
          cause: error,
        },
      );
    }
  };

/** Builds a creator that deletes existing cards for the round, then re-inserts. */
export const replaceCards =
  (db: Kysely<DB>): CardsCreator =>
  async (roundId, cards) => {
    try {
      await db
        .deleteFrom("cards")
        .where("round_id", "=", roundId)
        .executeTakeFirst();

      return await createCards(db)(roundId, cards);
    } catch (error) {
      throw new UnexpectedRepositoryError(
        `Failed to replace cards for round ${roundId}`,
        { cause: error },
      );
    }
  };

/** Builds an updater for partial card updates (currently selected-flag only). */
export const updateCards =
  (db: Kysely<DB>): CardUpdater =>
  async (cardIds, updates) => {
    if (cardIds.length === 0) {
      return [];
    }

    try {
      const updatedCards = await db
        .updateTable("cards")
        .set(updates)
        .where("id", "in", cardIds)
        .returning([
          "id",
          "round_id",
          "word",
          "card_type",
          "team_id",
          "selected",
          teamNameLookup,
        ])
        .execute();

      return updatedCards.map((card) => ({
        _id: card.id,
        _roundId: card.round_id,
        _teamId: card.team_id,
        teamName: card.team_name,
        word: card.word,
        cardType: card.card_type as CardType,
        selected: card.selected,
      }));
    } catch (error) {
      throw new UnexpectedRepositoryError(`Failed to update cards.`, {
        cause: error,
      });
    }
  };

/**
 * Builds a selector that fetches N random words from a deck.
 *
 * Throws `UnexpectedRepositoryError` if the deck has fewer matching words
 * than requested.
 */
export const getRandomWords =
  (db: Kysely<DB>): RandomWordsSelector =>
  async (count, deck = "BASE", languageCode = "en", excludeWords?: string[]) => {
    let query = db
      .selectFrom("decks")
      .where("language_code", "=", languageCode)
      .where("deck", "=", deck);

    if (excludeWords && excludeWords.length > 0) {
      query = query.where("word", "not in", excludeWords);
    }
    
    const words = await query
      .select("word")
      .orderBy(sql<number>`random()`)
      .limit(count)
      .execute();

    if (words.length < count) {
      throw new UnexpectedRepositoryError(
        `Not enough words available. Requested ${count}, but only found ${words.length}`,
      );
    }

    return words.map((w) => w.word);
  };
