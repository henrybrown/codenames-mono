import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import { DB } from "./db.types";
import type { AppLogger } from "../logging";

const { Pool } = pg;

let dbInstance: Kysely<DB> | null = null;

/**
 * @throws Error if connection test fails
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

export function getDb(): Kysely<DB> {
  if (!dbInstance) {
    throw new Error("Database not initialized. Call initializeDb first.");
  }
  return dbInstance;
}
