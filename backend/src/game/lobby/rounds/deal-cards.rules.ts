import { z } from "zod";
import { ROUND_STATE } from "@codenames/shared/types";
import { LobbyAggregate, lobbyBaseSchema } from "../state/types";
import { 
  LobbyValidationResult,
  ValidatedLobbyState,
  validateWithZodSchema
} from "../state/validation";

/**
 * Schema for validating card dealing
 */
const createDealCardsValidationSchema = (context?: { redeal?: boolean }) => lobbyBaseSchema
  .refine(
    (data) => data.currentRound !== null && data.currentRound !== undefined,
    {
      message: "No current round to deal cards to",
      path: ["currentRound"],
    }
  )
  .refine(
    (data) => data.currentRound?.status === ROUND_STATE.SETUP,
    {
      message: "Round must be in SETUP state to deal cards",
      path: ["currentRound", "status"],
    }
  )
  .refine(
    (data) => {
      // Allow re-dealing if redeal flag is set in context
      const isRedeal = context?.redeal === true;
      if (isRedeal) return true;
      
      return !data.currentRound?.cards || data.currentRound.cards.length === 0;
    },
    {
      message: "Cards have already been dealt for this round",
      path: ["currentRound", "cards"],
    }
  )
  .refine(
    (data) => data.teams.length >= 2,
    {
      message: "Game must have at least 2 teams to deal cards",
      path: ["teams"],
    }
  )
  .transform((data) => ({
    ...data,
    currentRound: data.currentRound!,
  }));

/**
 * Type for validated deal cards state
 */
export type DealCardsValidLobbyState = ValidatedLobbyState<ReturnType<typeof createDealCardsValidationSchema>>;

/**
 * Validates if cards can be dealt
 */
export function validate(
  data: LobbyAggregate,
  context?: { redeal?: boolean }
): LobbyValidationResult<DealCardsValidLobbyState> {
  const schema = createDealCardsValidationSchema(context);
  return validateWithZodSchema(schema, data);
}