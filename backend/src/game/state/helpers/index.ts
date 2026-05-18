/**
 * Pure derivation helpers for the loaded game aggregate.
 *
 * - `aggregate.ts` — round / turn / team accessors and "or-throw" variants.
 * - `players.ts` — player lookups by user, public id, or active role.
 * - `turn-phase.ts` — derive which role is active on a turn.
 */
export * from "./aggregate";
export * from "./players";
export * from "./turn-phase";
