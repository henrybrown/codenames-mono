import { Kysely } from "kysely";
import { DB } from "../../db/db.types";
import { UnexpectedRepositoryError } from "./repository.errors";

/** User primary-key id. */
export type UserId = number;
/** Session primary-key id. */
export type SessionId = number;
/** Opaque JWT or session token string. */
export type Token = string;

/** Input for creating a session. `expiresAt` defaults to +7 days. */
export type SessionInput = {
  userId: number;
  token: string;
  expiresAt?: Date;
};

/** Service-layer projection of a session row enriched with the username. */
export type SessionResult = {
  _id: number;
  _userId: number;
  username: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
};

/** Lookup-by-token signature. */
export type SessionFinder<T extends Token> = (
  identifier: T,
) => Promise<SessionResult | null>;

/** Lookup-by-user signature returning all live sessions. */
export type UserSessionFinder = (userId: UserId) => Promise<SessionResult[]>;

/** Signature for inserting a new session. */
export type SessionCreator = (input: SessionInput) => Promise<SessionResult>;

/** Signature for invalidating a session by token. */
export type SessionInvalidator = (token: Token) => Promise<boolean>;

/**
 * Builds a session creator.
 *
 * Currently stateless — returns a synthesised result rather than writing
 * to a `sessions` table (the codebase verifies tokens via JWT signature
 * alone). The DB lookup is only used to enrich the returned record with
 * the username. Falling back to a persisted sessions table later means
 * uncommenting the insert/select block in this file.
 */
export const storeSession =
  (db: Kysely<DB>): SessionCreator =>
  async ({ userId, token, expiresAt }) => {
    try {
      // Calculate expiration date if not provided (default: 7 days)
      const calculatedExpiresAt =
        expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      // Get the username for the user
      const user = await db
        .selectFrom("users")
        .where("id", "=", userId)
        .select(["username"])
        .executeTakeFirstOrThrow();

      // Insert the new session
      // Note: In a stateless JWT implementation, this might be simplified
      // or even just return a constructed object without DB insertion
      const session = {
        user_id: userId,
        token: token,
        expires_at: calculatedExpiresAt,
        created_at: new Date(),
      };

      // For future implementation - if you add a sessions table:
      // const newSession = await db
      //   .insertInto("sessions")
      //   .values(session)
      //   .returning(["id", "user_id", "token", "expires_at", "created_at"])
      //   .executeTakeFirstOrThrow();

      // Simulated result for stateless implementation
      return {
        _id: 0, // Placeholder ID for stateless implementation
        _userId: userId,
        username: user.username,
        token: token,
        expiresAt: calculatedExpiresAt,
        createdAt: new Date(),
      };
    } catch (error) {
      throw new UnexpectedRepositoryError(
        `Failed to create session for user: ${userId}`,
        {
          cause: error,
        },
      );
    }
  };

/**
 * Builds a session finder. Stateless implementation returns `null` —
 * token verification happens at the JWT layer, not against a DB row.
 */
export const findSessionByToken =
  (db: Kysely<DB>): SessionFinder<Token> =>
  async (token) => {
    // For a stateless JWT implementation, this would verify the JWT
    // and return the decoded data or null if invalid

    // For future implementation with a sessions table:
    // const session = await db
    //   .selectFrom("sessions")
    //   .innerJoin("users", "sessions.user_id", "users.id")
    //   .where("sessions.token", "=", token)
    //   .where("sessions.expires_at", ">", new Date())
    //   .select([
    //     "sessions.id",
    //     "sessions.user_id as userId",
    //     "users.username",
    //     "sessions.token",
    //     "sessions.expires_at as expiresAt",
    //     "sessions.created_at as createdAt"
    //   ])
    //   .executeTakeFirst();

    // Placeholder for stateless implementation
    return null;
  };

/**
 * Builds a session invalidator. Stateless implementation is a no-op
 * (returns true); a future persisted-sessions table would delete the
 * matching row.
 */
export const invalidateSession =
  (db: Kysely<DB>): SessionInvalidator =>
  async (token) => {
    try {
      // For a stateless JWT implementation, this might be a no-op
      // or could add the token to a blocklist/revocation list

      // For future implementation with a sessions table:
      // await db
      //   .deleteFrom("sessions")
      //   .where("token", "=", token)
      //   .execute();

      return true;
    } catch {
      return false;
    }
  };

/**
 * Builds a bulk session invalidator for a user. Stateless implementation
 * is a no-op (returns true); a future persisted-sessions table would
 * delete all rows for the user.
 */
export const invalidateUserSessions =
  (db: Kysely<DB>) =>
  async (userId: number): Promise<boolean> => {
    try {
      // For a stateless JWT implementation, this might add all tokens
      // for this user to a blocklist/revocation list

      // For future implementation with a sessions table:
      // await db
      //   .deleteFrom("sessions")
      //   .where("user_id", "=", userId)
      //   .execute();

      return true;
    } catch {
      return false;
    }
  };
