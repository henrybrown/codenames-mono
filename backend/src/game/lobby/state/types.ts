import { z } from "zod";
import { GAME_STATE, GAME_TYPE, GAME_FORMAT, ROUND_STATE, PLAYER_ROLE } from "@codenames/shared/types";

// Player schema for lobby context
export const playerSchema = z.object({
  _id: z.number().int().positive(),
  publicId: z.string(),
  _userId: z.number().int().positive(),
  _gameId: z.number().int().positive(),
  _teamId: z.number().int().positive(),
  teamName: z.string(),
  statusId: z.number().int().positive(),
  publicName: z.string(),
  role: z.string().default(PLAYER_ROLE.NONE),
});

// Team schema for lobby context
export const teamSchema = z.object({
  _id: z.number().int().positive(),
  _gameId: z.number().int().positive(),
  teamName: z.string(),
  players: z.array(playerSchema).default([]),
});

// User context for permissions
export const userContextSchema = z.object({
  _userId: z.number().int().positive(),
  canModifyGame: z.boolean().default(true),
  isHost: z.boolean().default(false),
});

// Player context for validation compatibility
export const playerContextSchema = z.object({
  _userId: z.number().int().positive(),
  _id: z.number().int().positive(),
  _teamId: z.number().int().positive(),
  username: z.string().optional().nullable(),
  publicName: z.string(),
  teamName: z.string(),
  role: z.enum([
    PLAYER_ROLE.SPECTATOR,
    PLAYER_ROLE.CODEMASTER,
    PLAYER_ROLE.CODEBREAKER,
    PLAYER_ROLE.NONE,
  ]),
});

// Simplified card schema for lobby 
export const cardSchema = z.object({
  _id: z.number().int().positive(),
  _roundId: z.number().int().positive(),
  _teamId: z.number().int().nullable(),
  teamName: z.string().optional().nullable(),
  word: z.string(),
  cardType: z.string(),
  selected: z.boolean(),
});

// Simplified round schema for lobby
export const roundSchema = z.object({
  _id: z.number().int().positive(),
  number: z.number().int().positive(),
  status: z.enum([
    ROUND_STATE.SETUP,
    ROUND_STATE.IN_PROGRESS,
    ROUND_STATE.COMPLETED,
  ]),
  cards: z.array(cardSchema).optional().default([]), 
  players: z.array(playerSchema).optional().default([]), 
  createdAt: z.date(),
});

// Historical round schema - minimal info for round count validation
export const historicalRoundSchema = z.object({
  _id: z.number().int().positive(),
  number: z.number().int().positive(),
  status: z.enum([
    ROUND_STATE.SETUP,
    ROUND_STATE.IN_PROGRESS,
    ROUND_STATE.COMPLETED,
  ]),
  _winningTeamId: z.number().int().positive().nullable(),
  winningTeamName: z.string().nullable(),
  createdAt: z.date(),
});

// Main lobby aggregate schema
export const lobbyBaseSchema = z.object({
  _id: z.number().int().positive(),
  public_id: z.string(),
  host_user_id: z.number().int().positive(),
  status: z.enum([
    GAME_STATE.LOBBY,
    GAME_STATE.IN_PROGRESS,
    GAME_STATE.COMPLETED,
    GAME_STATE.ABANDONED,
    GAME_STATE.PAUSED,
  ]),
  game_format: z.enum([
    GAME_FORMAT.BEST_OF_THREE,
    GAME_FORMAT.QUICK,
    GAME_FORMAT.ROUND_ROBIN,
  ]),
  gameType: z.enum([GAME_TYPE.SINGLE_DEVICE, GAME_TYPE.MULTI_DEVICE]),
  aiMode: z.boolean().default(false),
  teams: z.array(teamSchema),
  currentRound: roundSchema.optional().nullable(),
  historicalRounds: z.array(historicalRoundSchema).optional().default([]),
  userContext: userContextSchema,
  playerContext: playerContextSchema.nullable(),
  createdAt: z.date(),
  updatedAt: z.date().optional().nullable(),
});

// Type exports
export type Player = z.infer<typeof playerSchema>;
export type Team = z.infer<typeof teamSchema>;
export type UserContext = z.infer<typeof userContextSchema>;
export type PlayerContext = z.infer<typeof playerContextSchema>;
export type Card = z.infer<typeof cardSchema>;
export type Round = z.infer<typeof roundSchema>;
export type HistoricalRound = z.infer<typeof historicalRoundSchema>;
export type LobbyAggregate = z.infer<typeof lobbyBaseSchema>;