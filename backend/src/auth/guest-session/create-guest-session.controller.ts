import type { Request, Response, NextFunction } from "express";
import type { GuestUser } from "./create-guest-user.service";
import type { GuestLoginService } from "./guest-login.service";
import {
  createGuestResponseSchema,
  createGuestRequestSchema,
  CreateGuestResponse,
} from "./create-guest-session.validation";

type ControllerDependencies = {
  createGuestUser: () => Promise<GuestUser>;
  login: GuestLoginService;
};

export const createGuestUserController =
  ({ createGuestUser, login }: ControllerDependencies) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      createGuestRequestSchema.parse(req.body);

      const user = await createGuestUser();
      const session = await login(user.username);

      res.cookie("authToken", session.token, {
        httpOnly: true, // Prevents JavaScript access (security)
        secure: process.env.NODE_ENV === "production", // HTTPS only in production
        sameSite: "lax", // CSRF protection
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
        path: "/", // Available for all routes
      });

      const response: CreateGuestResponse = {
        success: true,
        data: {
          user: {
            username: user.username,
          },
          session: {
            username: user.username,
            token: session.token, // Keep this for debugging, remove in production
          },
        },
      };

      const validatedResponse = createGuestResponseSchema.parse(response);

      res.status(201).json(validatedResponse);
    } catch (error) {
      next(error);
    }
  };
