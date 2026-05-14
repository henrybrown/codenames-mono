import { GAME_STATE, ROUND_STATE } from "@codenames/shared/types";
import {
  gameplayBaseSchema,
  currentRoundSchema,
  turnSchema,
  type GameAggregate,
} from "@backend/game/state/types";
import {
  validateWithZodSchema,
  ValidatedGameState,
  GameplayValidationResult,
} from "@backend/game/state/validation";
import { z } from "zod";

const endTurnSchema = gameplayBaseSchema.extend({
  status: z.literal(GAME_STATE.IN_PROGRESS),
  currentRound: currentRoundSchema.extend({
    status: z.literal(ROUND_STATE.IN_PROGRESS),
    turns: z.array(turnSchema).min(1, "Must have turns to end"),
  }),
});

export type EndTurnValidGameState = ValidatedGameState<typeof endTurnSchema>;

export const validateEndTurn = (
  data: GameAggregate,
): GameplayValidationResult<EndTurnValidGameState> => {
  return validateWithZodSchema(endTurnSchema, data);
};
