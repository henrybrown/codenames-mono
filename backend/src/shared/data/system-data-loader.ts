import { Kysely } from "kysely";
import { DB } from "../db/db.types";
import { refreshBaseDecks } from "./decks/";
import { refreshEnums } from "./enums";
import { runSchemaMigrations } from "./schema-migrations";
import type { AppLogger } from "../logging";

export const refreshSystemData = (logger: AppLogger) => async (db: Kysely<DB>): Promise<void> => {
  const log = logger.for({ module: "system-data-loader" }).create();
  log.info("Starting data refresh");

  try {
    await runSchemaMigrations(logger)(db);

    await db.transaction().execute(async (trx) => {
      await refreshBaseDecks(log)(trx);
      await refreshEnums(log)(trx);
    });

    log.info("Data refresh completed");
  } catch (error) {
    log.error("Data refresh failed", { error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
};
