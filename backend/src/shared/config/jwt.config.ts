import { SignOptions } from "jsonwebtoken";

/** JWT signing secret + library options. */
export interface JwtConfig {
  secret: string;
  options: SignOptions;
}

/**
 * Builds a `JwtConfig` with sensible defaults (7d expiry, HS256, app
 * issuer). Caller overrides win — any field in `options` replaces the
 * default.
 *
 * Reading `JWT_SECRET` from `process.env` here is a fallback for tests
 * and scripts; in production wiring the secret comes from validated env.
 */
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
