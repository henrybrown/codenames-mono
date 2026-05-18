import { UnexpectedAuthError } from "../errors/auth.errors";
import {
  UserFinder,
  UserCreator,
  Username,
} from "@backend/shared/data-access/repositories/users.repository";
import { generateUsername } from "./username-generator";

type ServiceDependencies = {
  findUser: UserFinder<Username>;
  createUser: UserCreator;
};

/** Newly created guest user. */
export type GuestUser = {
  _id: number;
  username: string;
};

/**
 * Builds a service that creates a guest user with a generated unique username.
 *
 * Retries up to 10 times if the random name collides with an existing
 * row; throws `UnexpectedAuthError` if all attempts collide (effectively
 * never in practice — 10⁷ combinations vs ~tens of thousands of users).
 */
export const createGuestUserService = ({
  findUser,
  createUser,
}: ServiceDependencies) => {
  const findUniqueUsername = async (): Promise<Username> => {
    const MAX_COLLISIONS = 10;

    for (
      let collisionCount = 0;
      collisionCount < MAX_COLLISIONS;
      collisionCount++
    ) {
      const username = generateUsername();
      const existingUser = await findUser(username);

      if (!existingUser) return username;
    }

    throw new UnexpectedAuthError(
      "Failed to generate unique username... reached max collisions (10)",
    );
  };

  return async (): Promise<GuestUser> => {
    const username = await findUniqueUsername();
    const user = await createUser({ username });

    return {
      _id: user._id,
      username: user.username,
    };
  };
};
