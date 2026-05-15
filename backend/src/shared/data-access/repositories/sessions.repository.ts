import { Kysely } from "kysely";
import { DB } from "../../db/db.types";
import { UnexpectedRepositoryError } from "./repository.errors";

export type UserId = number;
export type SessionId = number;
export type Token = string;

export type SessionInput = {
  userId: number;
  token: string;
  expiresAt?: Date;
};

export type SessionResult = {
  _id: number;
  _userId: number;
  username: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
};

export type SessionFinder<T extends Token> = (
  identifier: T,
) => Promise<SessionResult | null>;

export type UserSessionFinder = (userId: UserId) => Promise<SessionResult[]>;

export type SessionCreator = (input: SessionInput) => Promise<SessionResult>;

export type SessionInvalidator = (token: Token) => Promise<boolean>;

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
