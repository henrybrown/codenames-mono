import { Kysely, sql } from "kysely";
import type { DB } from "../db/db.types";
import type { AppLogger } from "../logging";

type Migration = {
  name: string;
  up: (db: Kysely<DB>) => Promise<void>;
};

/**
 * Idempotent schema migrations that run on every startup.
 * Each migration must be safe to run multiple times (use IF NOT EXISTS, etc.).
 * Add new migrations to the end of the array.
 */
const migrations: Migration[] = [
  {
    name: "add_games_ai_mode",
    up: async (db) => {
      await sql`ALTER TABLE games ADD COLUMN IF NOT EXISTS ai_mode BOOLEAN DEFAULT false`.execute(db);
    },
  },
];

export const runSchemaMigrations = (logger: AppLogger) => async (db: Kysely<DB>): Promise<void> => {
  const log = logger.for({ module: "schema-migrations" }).create();
  log.info("Running schema migrations");

  for (const migration of migrations) {
    try {
      await migration.up(db);
      log.debug(`Migration applied: ${migration.name}`);
    } catch (error) {
      log.error(`Migration failed: ${migration.name}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  log.info("Schema migrations complete");
};
