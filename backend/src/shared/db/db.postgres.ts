import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import { DB } from "./db.types";
import type { AppLogger } from "../logging";

const { Pool } = pg;

let dbInstance: Kysely<DB> | null = null;

/**
 * Initializes the Kysely-over-Postgres DB connection.
 *
 * Tests the pool with a real `connect()` round-trip before returning,
 * so connection failures abort the bootstrap. Throws if the DB has
 * already been initialized (single-instance constraint).
 */
export const initializeDb = (logger: AppLogger) => async (connectionString: string): Promise<Kysely<DB>> => {
  if (dbInstance) throw new Error("Database already initialized");

  const log = logger.for({ module: "database" }).create();

  const pool = new Pool({
    connectionString,
  });

  try {
    const client = await pool.connect();
    client.release();
    log.info("Database connection successful");
  } catch (error) {
    log.error("Database connection failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    if (error instanceof Error) {
      throw new Error(`Failed to connect to database: ${error.message}`);
    }
    throw error;
  }

  dbInstance = new Kysely<DB>({
    dialect: new PostgresDialect({ pool }),
  });

  return dbInstance;
}

/**
 * Returns the initialized DB instance.
 *
 * Throws if called before `initializeDb` — there's no implicit lazy init,
 * since that would mask config errors during startup.
 */
export function getDb(): Kysely<DB> {
  if (!dbInstance) {
    throw new Error("Database not initialized. Call initializeDb first.");
  }
  return dbInstance;
}
