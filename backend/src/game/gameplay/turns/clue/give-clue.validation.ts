import { z } from "zod";
import { PLAYER_ROLE } from "@codenames/shared/types";

const clueFields = z.object({
  word: z.string().min(1).max(50),
  targetCardCount: z.number().int().min(1).max(25),
});

/**
 * Single-device clue body: the role identifies which player on the
 * active turn is acting (controllers resolve this against the aggregate).
 */
export const giveClueSingleDeviceBody = clueFields.extend({
  role: z.enum([PLAYER_ROLE.CODEMASTER, PLAYER_ROLE.CODEBREAKER]),
});

/** Multi-device clue body: playerId for symmetry; identity comes from JWT. */
export const giveClueMultiDeviceBody = clueFields.extend({
  playerId: z.string().min(1),
});

export type GiveClueSingleDeviceBody = z.infer<typeof giveClueSingleDeviceBody>;
export type GiveClueMultiDeviceBody = z.infer<typeof giveClueMultiDeviceBody>;
