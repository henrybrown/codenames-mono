/**
 * Zod schemas and inferred TypeScript types for the gameplay aggregate.
 *
 * The aggregate is the single source of truth for game state at the
 * service layer — every gameplay action takes one of these as input.
 * Action-specific schemas extend `gameplayBaseSchema` with refinements
 * that narrow it down to a valid state for that action.
 */
import { z } from "zod";
import { GAME_STATE, GAME_FORMAT, GAME_TYPE, ROUND_STATE, PLAYER_ROLE } from "@codenames/shared/types";

/** Player row as it appears inside the aggregate. */
export const playerSchema = z.object({
  _id: z.number().int().positive(),
  publicId: z.string(),
  _userId: z.number().int().positive(),
  _gameId: z.number().int().positive(),
  _teamId: z.number().int().positive(),
  teamName: z.string(),
  statusId: z.number().int().positive(),
  publicName: z.string(),
  role: z.string(),
  isAi: z.boolean(),
});

/** Team with its embedded player roster. */
export const teamSchema = z.object({
  _id: z.number().int().positive(),
  _gameId: z.number().int().positive(),
  teamName: z.string(),
  players: z.array(playerSchema).optional().default([]),
});

/** Board card; `_teamId`/`teamName` are nullable for bystander and assassin cards. */
export const cardSchema = z.object({
  _id: z.number().int().positive(),
  _roundId: z.number().int().positive(),
  _teamId: z.number().int().nullable(),
  teamName: z.string().optional().nullable(),
  word: z.string(),
  cardType: z.string(),
  selected: z.boolean(),
});

/** A single guess on a turn, with denormalized card-word and player-name. */
export const guessSchema = z.object({
  _id: z.number().int().positive(),
  _turnId: z.number().int().positive(),
  _playerId: z.number().int().positive(),
  _cardId: z.number().int().positive(),
  cardWord: z.string(),
  playerName: z.string(),
  outcome: z.string().nullable(),
  createdAt: z.date(),
});

/** A clue given on a turn — the spymaster's word + target count. */
export const clueSchema = z.object({
  _id: z.number().int().positive(),
  _turnId: z.number().int().positive(),
  word: z.string(),
  number: z.number().int().positive(),
  createdAt: z.date(),
});

/**
 * Schema for the active phase on a turn.
 * Describes WHAT is active (a role on a team), not a specific player.
 * - playerName is set for CODEMASTER (one person), null for CODEBREAKER (group).
 */
export const turnPhaseSchema = z.object({
  teamName: z.string(),
  role: z.enum([PLAYER_ROLE.CODEMASTER, PLAYER_ROLE.CODEBREAKER]),
  isAi: z.boolean(),
  playerName: z.string().nullable(),
});

/** A single turn, including its (optional) clue and recorded guesses. */
export const turnSchema = z.object({
  _id: z.number().int().positive(),
  publicId: z.string().uuid(),
  _roundId: z.number().int().positive(),
  _teamId: z.number().int().positive(),
  teamName: z.string(),
  status: z.string(),
  guessesRemaining: z.number().int(),
  createdAt: z.date(),
  completedAt: z.date().nullable(),
  clue: clueSchema.optional(),
  guesses: z.array(guessSchema).default([]),
  active: turnPhaseSchema.nullable().optional(),
});

/** A round with its cards, turns, and player roster. */
export const roundSchema = z.object({
  _id: z.number().int().positive(),
  number: z.number().int().positive(),
  status: z.enum([ROUND_STATE.SETUP, ROUND_STATE.IN_PROGRESS, ROUND_STATE.COMPLETED]),
  _winningTeamId: z.number().int().positive().nullable(),
  winningTeamName: z.string().nullable(),
  cards: z.array(cardSchema).optional().default([]),
  turns: z.array(turnSchema).optional().default([]),
  players: z.array(playerSchema).optional().default([]),
  createdAt: z.date(),
});

/** Current-round schema — currently identical to `roundSchema`. */
export const currentRoundSchema = roundSchema;

/**
 * Historical round summary — winner only, no cards or turns.
 *
 * Past rounds are stored in `historicalRounds` to keep the aggregate from
 * ballooning; full detail is fetched on demand.
 */
export const historicalRoundSchema = z.object({
  _id: z.number().int().positive(),
  number: z.number().int().positive(),
  status: z.enum([ROUND_STATE.SETUP, ROUND_STATE.IN_PROGRESS, ROUND_STATE.COMPLETED]),
  _winningTeamId: z.number().int().positive().nullable(),
  winningTeamName: z.string().nullable(),
  createdAt: z.date(),
});

/**
 * Base shape for a game aggregate.
 *
 * Action-specific schemas (e.g. `giveClueSchema`, `makeGuessSchema`) extend
 * this with refinements that narrow the game/round/turn state to what the
 * action requires.
 */
export const gameplayBaseSchema = z.object({
  _id: z.number().int().positive(),
  public_id: z.string(),
  status: z.enum([
    GAME_STATE.LOBBY,
    GAME_STATE.IN_PROGRESS,
    GAME_STATE.COMPLETED,
    GAME_STATE.ABANDONED,
    GAME_STATE.PAUSED,
  ]),
  game_type: z.enum([GAME_TYPE.SINGLE_DEVICE, GAME_TYPE.MULTI_DEVICE]),
  game_format: z.enum([GAME_FORMAT.BEST_OF_THREE, GAME_FORMAT.QUICK, GAME_FORMAT.ROUND_ROBIN]),
  aiMode: z.boolean().default(false),
  teams: z.array(teamSchema),
  currentRound: currentRoundSchema.optional().nullable(),
  historicalRounds: z.array(historicalRoundSchema).optional().default([]),
  createdAt: z.date(),
  updatedAt: z.date().optional().nullable(),
});

/** Inferred TS types for each schema above. */
export type HistoricalRound = z.infer<typeof historicalRoundSchema>;
/** Constraint type used by action-specific schemas to declare they're
 *  refinements of the base aggregate shape. */
export type GameplaySchema = z.ZodType<GameAggregate, any, GameAggregate>;

export type Player = z.infer<typeof playerSchema>;
export type Team = z.infer<typeof teamSchema>;
export type Card = z.infer<typeof cardSchema>;
export type Guess = z.infer<typeof guessSchema>;
export type Clue = z.infer<typeof clueSchema>;
export type Turn = z.infer<typeof turnSchema>;
export type TurnPhase = z.infer<typeof turnPhaseSchema>;
export type Round = z.infer<typeof roundSchema>;
export type CurrentRound = z.infer<typeof currentRoundSchema>;
export type GameAggregate = z.infer<typeof gameplayBaseSchema>;
