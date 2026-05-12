import { z } from "zod";
import { PLAYER_ROLE } from "@codenames/shared/types";

/**
 * Single-device guess body: role + cardWord. The role disambiguates
 * which player on the active turn is making the guess.
 */
export const makeGuessSingleDeviceBody = z.object({
  role: z.enum([PLAYER_ROLE.CODEMASTER, PLAYER_ROLE.CODEBREAKER]),
  cardWord: z.string().min(1).max(50),
});

/** Multi-device guess body: identity comes from JWT, body just carries the card. */
export const makeGuessMultiDeviceBody = z.object({
  playerId: z.string().min(1),
  cardWord: z.string().min(1).max(50),
});

export type MakeGuessSingleDeviceBody = z.infer<typeof makeGuessSingleDeviceBody>;
export type MakeGuessMultiDeviceBody = z.infer<typeof makeGuessMultiDeviceBody>;
