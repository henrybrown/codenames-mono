import { SignOptions } from "jsonwebtoken";

export interface JwtConfig {
  secret: string;
  options: SignOptions;
}

export const createJwtConfig = (
  secret: string = process.env.JWT_SECRET || "your-secret-key",
  options: Partial<SignOptions> = {},
): JwtConfig => {
  return {
    secret,
    options: {
      expiresIn: "7d",
      algorithm: "HS256",
      issuer: "codenames-app",
      ...options,
    },
  };
};
