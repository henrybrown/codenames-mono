import { Kysely } from "kysely";
import { DB } from "../../db/db.types";
import { UnexpectedRepositoryError } from "./repository.errors";

export type UserId = number;
export type Username = string;

export type UserData = {
  username: string;
  created_at: Date;
};

export type UserInput = {
  username: string;
};

export type UserResult = {
  _id: number;
  username: string;
  created_at: Date;
};

export type UserFinder<T extends UserId | Username> = (
  identifier: T,
) => Promise<UserResult | null>;

export type UserCreator = (input: UserInput) => Promise<UserResult>;

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
