import { z } from "zod";

/**
 * Single-device start-turn body: optional playerId. When omitted, the
 * service falls back to the first member of the first team (start-turn
 * doesn't use the actor for game-rule decisions, only for attribution).
 */
export const startTurnSingleDeviceBody = z.object({
  playerId: z.string().min(1).optional(),
});

/** Multi-device: playerId required (identity from JWT). */
export const startTurnMultiDeviceBody = z.object({
  playerId: z.string().min(1),
});

export type StartTurnSingleDeviceBody = z.infer<typeof startTurnSingleDeviceBody>;
export type StartTurnMultiDeviceBody = z.infer<typeof startTurnMultiDeviceBody>;
