import enBaseDeck from "./en_base_deck.json" with { type: "json" };
import esBaseDeck from "./es_base_deck.json" with { type: "json" };
import { Transaction } from "kysely";
import { DB } from "../../db/db.types";
import type { AppLogger } from "../../logging";

const BASE_DECK_IDS = ["BASE"];

/**
 * Replaces the contents of the `decks` table with the bundled base decks.
 *
 * Deletes any rows tagged `BASE` then re-inserts from `en_base_deck.json`
 * and `es_base_deck.json`. Runs inside the caller's transaction so a
 * partial failure doesn't leave the table half-populated.
 */
export const refreshBaseDecks = (logger: AppLogger) => async (trx: Transaction<DB>): Promise<void> => {
  const decks = [enBaseDeck, esBaseDeck];

  try {
    logger.debug("Starting deck refresh");

    const deleteResult = await trx
      .deleteFrom("decks")
      .where("deck", "in", BASE_DECK_IDS)
      .executeTakeFirst();

    logger.debug("Deleted existing deck entries", { count: Number(deleteResult.numDeletedRows ?? 0) });

    for (const deckData of decks) {
      const rows = deckData.decks;

      if (!Array.isArray(rows) || rows.length === 0) {
        logger.warn("No deck data found in deck file, skipping");
        continue;
      }

      const sampleCard = rows[0];
      const deckName = sampleCard?.deck || "unknown";
      const languageCode = sampleCard?.language_code || "unknown";

      logger.debug("Refreshing deck", { deck: deckName, language: languageCode, cards: rows.length });

      try {
        const insertResult = await trx
          .insertInto("decks")
          .values(rows)
          .executeTakeFirst();

        logger.debug("Deck refreshed", {
          deck: deckName,
          inserted: Number(insertResult.numInsertedOrUpdatedRows ?? rows.length),
        });
      } catch (deckError) {
        logger.error("Error refreshing deck", {
          deck: deckName,
          error: deckError instanceof Error ? deckError.message : String(deckError),
        });
        throw deckError;
      }
    }

    logger.debug("All base decks refreshed");
  } catch (error) {
    logger.error("Deck refresh failed", { error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
};
