import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";
import { StartRoundService } from "./start-round.service";
import { pickStatus } from "@backend/shared/http/result-status";
import { z } from "zod";

/**
 * Request validation schema for round start
 */
export const startRoundRequestSchema = z.object({
  params: z.object({
    gameId: z.string().min(1, "Game ID is required"),
    roundNumber: z
      .string()
      .transform(Number)
      .refine((n) => n > 0, "Round number must be positive"),
  }),
  auth: z.object({
    userId: z.number().int().positive("User ID must be a positive integer"),
  }),
});

/**
 * Type definition for validated request
 */
export type ValidatedStartRoundRequest = z.infer<
  typeof startRoundRequestSchema
>;

/**
 * Response schema for round start
 */
export const startRoundResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    round: z.object({
      roundNumber: z.number(),
      status: z.string(),
    }),
  }),
});

/**
 * Type definition for error response
 */
export type StartRoundErrorResponse = {
  success: false;
  error: string;
  details?: {
    validationErrors?: { path: string; message: string }[];
  };
};

/**
 * Type definition for start round response
 */
export type StartRoundResponse = z.infer<typeof startRoundResponseSchema>;

/**
 * Dependencies required by the start round controller
 */
export type Dependencies = {
  startRound: StartRoundService;
};

/**
 * Creates a controller for handling round start
 */
export const startRoundController = ({ startRound }: Dependencies) => {
  /**
   * Handles HTTP request to start a round in a game
   * @param req - Express request with game ID and round number
   * @param res - Express response object
   * @param next - Express error handling function
   */
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validationResult = startRoundRequestSchema.safeParse({
        params: req.params,
        auth: req.auth,
      });

      if (!validationResult.success) {
        res.status(400).json({
          success: false,
          error: "Invalid request",
          details: { validation: validationResult.error },
        });
        return;
      }

      const validatedRequest = validationResult.data;

      const result = await startRound({
        gameId: validatedRequest.params.gameId,
        roundNumber: validatedRequest.params.roundNumber,
        userId: validatedRequest.auth.userId,
      });

      if (!result.success) {
        const errorResponse: StartRoundErrorResponse = {
          success: false,
          error: result.message,
        };
        if (result.validationErrors) {
          errorResponse.details = { validationErrors: result.validationErrors };
        }
        res.status(pickStatus(result)).json(errorResponse);
        return;
      }

      // Only expose round number and status, no internal IDs
      const response: StartRoundResponse = {
        success: true,
        data: {
          round: {
            roundNumber: result.data.roundNumber,
            status: result.data.status,
          },
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };
};
