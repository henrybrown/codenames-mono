import { z } from "zod";

/**
 * Validation schema for guest user creation request
 *
 * The request doesn't require any input fields - the username
 * is generated automatically by the service.
 */
export const createGuestRequestSchema = z.object({}).strict();

/** Parsed request body shape — empty object. */
export type CreateGuestRequest = z.infer<typeof createGuestRequestSchema>;

/**
 * Strict response schema for guest creation.
 *
 * Rejects extra keys so accidental field leaks (e.g. internal user ids)
 * fail the schema check before being sent on the wire.
 */
export const createGuestResponseSchema = z
  .object({
    success: z.boolean(),
    data: z.object({
      user: z.object({
        username: z.string().min(3),
      }),
      session: z
        .object({
          username: z.string(),
          token: z.string(),
        })
        .strict(),
    }),
  })
  .strict();

/** Wire-format response shape for guest creation. */
export type CreateGuestResponse = z.infer<typeof createGuestResponseSchema>;
