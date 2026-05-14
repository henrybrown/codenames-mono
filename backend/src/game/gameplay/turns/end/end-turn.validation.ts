import { z } from "zod";
import { PLAYER_ROLE } from "@codenames/shared/types";

/**
 * Single-device end-turn body: role identifies who is ending the turn.
 * The service still gate-checks that only codebreakers can end turns.
 */
export const endTurnSingleDeviceBody = z.object({
  role: z.enum([PLAYER_ROLE.CODEMASTER, PLAYER_ROLE.CODEBREAKER]),
});

/** Multi-device: playerId required (identity from JWT). */
export const endTurnMultiDeviceBody = z.object({
  playerId: z.string().min(1),
});

export type EndTurnSingleDeviceBody = z.infer<typeof endTurnSingleDeviceBody>;
export type EndTurnMultiDeviceBody = z.infer<typeof endTurnMultiDeviceBody>;
