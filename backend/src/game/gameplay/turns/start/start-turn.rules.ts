import { GAME_STATE, ROUND_STATE } from "@codenames/shared/types";
import {
  gameplayBaseSchema,
  currentRoundSchema,
  teamSchema,
  type GameAggregate,
} from "@backend/game/state/types";
import {
  validateWithZodSchema,
  ValidatedGameState,
  GameplayValidationResult,
} from "@backend/game/state/validation";
import { z } from "zod";

const startTurnSchema = gameplayBaseSchema
  .extend({
    status: z.literal(GAME_STATE.IN_PROGRESS),
    currentRound: currentRoundSchema.extend({
      status: z.literal(ROUND_STATE.IN_PROGRESS),
    }),
    teams: z.array(teamSchema).min(2, "Must have at least 2 teams"),
  })
  .refine(
    (data) => !data.currentRound.turns.some((t) => t.status === "ACTIVE"),
    { message: "Active turn already exists" },
  )
  .refine(
    (data) => data.currentRound.turns.length > 0,
    { message: "No previous turn found" },
  )
  .refine(
    (data) => {
      const lastTurn = data.currentRound.turns[data.currentRound.turns.length - 1];
      return lastTurn?.status === "COMPLETED";
    },
    { message: "Previous turn not completed" },
  );

export type StartTurnValidGameState = ValidatedGameState<typeof startTurnSchema>;

export const validateStartTurn = (
  data: GameAggregate,
): GameplayValidationResult<StartTurnValidGameState> => {
  return validateWithZodSchema(startTurnSchema, data);
};
