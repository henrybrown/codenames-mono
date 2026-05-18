import playerStatuses from "./player-statuses.json" with { type: "json" };
import gameStatuses from "./game-statuses.json" with { type: "json" };
import playerRoles from "./player-roles.json" with { type: "json" };
import { Transaction, sql } from "kysely";
import { DB } from "../../db/db.types";
import type { AppLogger } from "../../logging";

const enums = [gameStatuses, playerStatuses, playerRoles];

/**
 * Replaces enum lookup tables (game/player statuses, player roles) from
 * the bundled JSON sources.
 *
 * Defers FK constraints for the duration so dependent rows aren't rejected
 * during the truncate-and-reinsert. Runs inside the caller's transaction.
 */
export const refreshEnums = (logger: AppLogger) => async (trx: Transaction<DB>) => {
  try {
    await sql`SET CONSTRAINTS ALL DEFERRED`.execute(trx);

    logger.debug("Refreshing system enum data");

    for (const enumData of enums) {
      for (const [tableName, rows] of Object.entries(enumData)) {
        if (!Array.isArray(rows) || rows.length === 0) {
          logger.warn("Empty or invalid data for table, skipping", { table: tableName });
          continue;
        }

        logger.debug("Refreshing enum table", { table: tableName });

        await trx.deleteFrom(tableName as keyof DB).execute();

        await trx
          .insertInto(tableName as keyof DB)
          .values(rows as [] | {})
          .execute();

        logger.debug("Enum table refreshed", { table: tableName, rows: rows.length });
      }
    }

    logger.debug("All enum data refreshed");
  } catch (error) {
    logger.error("Enum refresh failed", { error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
};
