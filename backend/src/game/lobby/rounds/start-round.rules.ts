import { z } from "zod";
import { GAME_STATE, ROUND_STATE } from "@codenames/shared/types";
import { LobbyAggregate, lobbyBaseSchema } from "../state/types";
import { 
  LobbyValidationResult,
  ValidatedLobbyState,
  validateWithZodSchema
} from "../state/validation";

const startRoundValidationSchema = lobbyBaseSchema
  .refine(
    (data) => data.currentRound !== null && data.currentRound !== undefined,
    {
      message: "No current round to start",
      path: ["currentRound"],
    }
  )
  .refine(
    (data) => data.status === GAME_STATE.IN_PROGRESS,
    {
      message: "Game must be in IN_PROGRESS state to start a round",
      path: ["status"],
    }
  )
  .refine(
    (data) => data.currentRound?.status === ROUND_STATE.SETUP,
    {
      message: "Round must be in SETUP state to start",
      path: ["currentRound", "status"],
    }
  )
  .refine(
    (data) => data.currentRound?.cards !== undefined && data.currentRound.cards.length > 0,
    {
      message: "Cards must be dealt before starting the round",
      path: ["currentRound", "cards"],
    }
  )
  .refine(
    (data) => {
      if (data.aiMode) {
        return true;
      }
      return data.teams.every((team) => team.players.length >= 2);
    },
    {
      message: "Each team must have at least 2 players (unless AI mode is enabled)",
      path: ["teams"],
    }
  )
  .transform((data) => ({
    ...data,
    currentRound: {
      ...data.currentRound!,
      cards: data.currentRound!.cards!,
    },
  }));

/**
 * Branded lobby shape returned by `validate`.
 *
 * Guarantees game is IN_PROGRESS, current round exists in SETUP with
 * cards dealt, and (outside AI mode) at least 2 players per team.
 */
export type StartRoundValidLobbyState = ValidatedLobbyState<typeof startRoundValidationSchema>;

/** Validates that the current round can be started. Returns flattened errors when not. */
export function validate(
  data: LobbyAggregate
): LobbyValidationResult<StartRoundValidLobbyState> {
  return validateWithZodSchema(startRoundValidationSchema, data);
}