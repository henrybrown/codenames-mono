import jwt, { SignOptions } from "jsonwebtoken";
import { UnexpectedAuthError } from "../errors/auth.errors";
import type {
  UserFinder,
  Username,
} from "@backend/shared/data-access/repositories/users.repository";
import type { SessionCreator } from "@backend/shared/data-access/repositories/sessions.repository";
import type { SessionResult } from "@backend/shared/data-access/repositories/sessions.repository";

type ServiceDependencies = {
  findUser: UserFinder<Username>;
  storeSession: SessionCreator;
  jwtSecret: string;
  jwtOptions: SignOptions;
};

/** Successful login payload — name (echoed) and the signed JWT. */
export type GuestLoginResult = {
  username: string;
  token: string;
};

/** Service contract for the guest login flow. */
export type GuestLoginService = (
  username: Username,
) => Promise<GuestLoginResult>;

/**
 * Builds the guest login service.
 *
 * Looks the user up by username, signs a JWT carrying `userId` + `username`,
 * and persists a session row. Throws `UnexpectedAuthError` if either lookup
 * or session write returns nothing — both represent invariant violations
 * (the caller should have just created the user).
 */
export const guestLoginService =
  ({
    findUser,
    storeSession,
    jwtSecret,
    jwtOptions,
  }: ServiceDependencies): GuestLoginService =>
  async (username) => {
    const sanitizedUsername = username.trim();
    const user = await findUser(sanitizedUsername);

    if (!user) {
      throw new UnexpectedAuthError(
        `Failed to login guest user: ${sanitizedUsername}`,
      );
    }

    const token = jwt.sign(
      { userId: user._id, username: user.username },
      jwtSecret,
      jwtOptions,
    );

    const session = await storeSession({
      userId: user._id,
      token,
    });

    if (!session) {
      throw new UnexpectedAuthError(
        `Failed to create session for user: ${sanitizedUsername}`,
      );
    }

    return {
      username: user.username,
      token: session.token,
    };
  };
