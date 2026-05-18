import { Kysely } from "kysely";
import { DB } from "../../db/db.types";
import { UnexpectedRepositoryError } from "./repository.errors";

/** Internal numeric primary key. */
export type UserId = number;
/** Public-facing user identifier. */
export type Username = string;

/** DB row shape for the users table. */
export type UserData = {
  username: string;
  created_at: Date;
};

/** Input for creating a new user. */
export type UserInput = {
  username: string;
};

/** Service-layer projection of a user row. */
export type UserResult = {
  _id: number;
  username: string;
  created_at: Date;
};

/** Lookup-by-key signature; the key is either a userId or a username. */
export type UserFinder<T extends UserId | Username> = (
  identifier: T,
) => Promise<UserResult | null>;

/** Signature for inserting a new user row. */
export type UserCreator = (input: UserInput) => Promise<UserResult>;

/** Builds a finder that looks up users by username. */
export const findByUsername =
  (db: Kysely<DB>): UserFinder<Username> =>
  async (username) => {
    const user = await db
      .selectFrom("users")
      .where("username", "=", username)
      .select(["id", "username", "created_at"])
      .executeTakeFirst();

    return user
      ? {
          _id: user.id,
          username: user.username,
          created_at: user.created_at,
        }
      : null;
  };

/** Builds a finder that looks up users by internal id. */
export const findById =
  (db: Kysely<DB>): UserFinder<UserId> =>
  async (userId) => {
    const user = await db
      .selectFrom("users")
      .where("id", "=", userId)
      .select(["id", "username", "created_at"])
      .executeTakeFirst();

    return user
      ? {
          _id: user.id,
          username: user.username,
          created_at: user.created_at,
        }
      : null;
  };

/**
 * Builds a creator that inserts a new user row.
 *
 * Wraps insert failures (e.g. unique-constraint violations) in
 * `UnexpectedRepositoryError` with the underlying cause attached.
 */
export const createUser =
  (db: Kysely<DB>): UserCreator =>
  async ({ username }) => {
    try {
      const newUser = await db
        .insertInto("users")
        .values({
          username,
          created_at: new Date(),
        })
        .returning(["id", "username", "created_at"])
        .executeTakeFirstOrThrow();

      return {
        _id: newUser.id,
        username: newUser.username,
        created_at: newUser.created_at,
      };
    } catch (error) {
      throw new UnexpectedRepositoryError(
        `Failed to create user: ${username}`,
        {
          cause: error,
        },
      );
    }
  };
