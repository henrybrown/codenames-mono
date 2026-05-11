import { z } from "zod";
import { GAME_STATE, ROUND_STATE, MAX_ROUNDS_BY_FORMAT } from "@codenames/shared/types";
import { LobbyAggregate, lobbyBaseSchema } from "../state/types";
import { 
  LobbyValidationResult,
  ValidatedLobbyState,
  validateWithZodSchema
} from "../state/validation";

/**
 * Schema for validating new round creation
 */
const newRoundValidationSchema = lobbyBaseSchema
  .refine(
    (data) => data.status === GAME_STATE.IN_PROGRESS,
    {
      message: "Game must be in IN_PROGRESS state to create a new round",
      path: ["status"],
    }
  )
  .refine(
    (data) => !data.currentRound || data.currentRound.status === ROUND_STATE.COMPLETED,
    {
      message: "Current round must be completed before creating a new round",
      path: ["currentRound", "status"],
    }
  )
  .refine(
    (data) => {
      const completedRounds = data.historicalRounds?.length || 0;
      const maxRounds = MAX_ROUNDS_BY_FORMAT[data.game_format];
      return completedRounds < maxRounds;
    },
    (data) => ({
      message: `Maximum of ${MAX_ROUNDS_BY_FORMAT[data.game_format]} rounds allowed for ${data.game_format} format`,
      path: ["historicalRounds"],
    })
  );

/**
 * Type for validated new round state
 */
export type NewRoundValidLobbyState = ValidatedLobbyState<typeof newRoundValidationSchema>;

/**
 * Validates if a new round can be created
 */
export function validate(
  data: LobbyAggregate
): LobbyValidationResult<NewRoundValidLobbyState> {
  return validateWithZodSchema(newRoundValidationSchema, data);
}