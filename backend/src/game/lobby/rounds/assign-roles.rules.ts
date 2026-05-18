import { z } from "zod";
import { ROUND_STATE, PLAYER_ROLE } from "@codenames/shared/types";
import { LobbyAggregate, lobbyBaseSchema } from "../state/types";
import { 
  LobbyValidationResult,
  ValidatedLobbyState,
  validateWithZodSchema
} from "../state/validation";

const assignRolesValidationSchema = lobbyBaseSchema
  .refine(
    (data) => data.currentRound !== null && data.currentRound !== undefined,
    {
      message: "No current round to assign roles to",
      path: ["currentRound"],
    }
  )
  .refine(
    (data) => data.currentRound?.status === ROUND_STATE.SETUP,
    {
      message: "Round must be in SETUP state to assign roles",
      path: ["currentRound", "status"],
    }
  )
  .refine(
    (data) => {
      if (!data.currentRound?.players) return true;
      return data.currentRound.players.every(
        (player) => !player.role || player.role === PLAYER_ROLE.NONE
      );
    },
    {
      message: "Roles have already been assigned for this round",
      path: ["currentRound", "players"],
    }
  )
  .refine(
    (data) => {
      // In AI mode, skip player count validation (AI bots will be added during start round)
      if (data.aiMode) {
        return true;
      }
      return data.teams.every((team) => team.players.length >= 2);
    },
    {
      message: "Each team must have at least 2 players to assign roles (unless AI mode is enabled)",
      path: ["teams"],
    }
  )
  .transform((data) => ({
    ...data,
    currentRound: data.currentRound!,
  }));

/**
 * Branded lobby shape returned by `validate`.
 *
 * Guarantees a current round in SETUP state, no roles assigned yet, and
 * (outside AI mode) at least 2 players per team. The transform pins
 * `currentRound` as non-null so downstream code doesn't need to recheck.
 */
export type AssignRolesValidLobbyState = ValidatedLobbyState<typeof assignRolesValidationSchema>;

/**
 * Validates that the lobby is in a state where roles can be assigned.
 * Returns flattened errors when not.
 */
export function validate(
  data: LobbyAggregate
): LobbyValidationResult<AssignRolesValidLobbyState> {
  return validateWithZodSchema(assignRolesValidationSchema, data);
}