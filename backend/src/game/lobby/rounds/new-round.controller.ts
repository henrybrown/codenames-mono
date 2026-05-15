import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";
import type { RoundCreationService } from "./new-round.service";
import { pickStatus } from "@backend/shared/http/result-status";
import { z } from "zod";

export const newRoundRequestSchema = z.object({
  params: z.object({
    gameId: z.string().min(1, "Game ID is required"),
  }),
  auth: z.object({
    userId: z.number().int().positive("User ID must be a positive integer"),
  }),
});

export const newRoundResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    round: z.object({
      roundNumber: z.number(),
      status: z.string(),
      createdAt: z.date(),
      cards: z.array(z.object({
        _id: z.number(),
        _roundId: z.number(),
        word: z.string(),
        cardType: z.string(),
        _teamId: z.number().nullable(),
        teamName: z.string().nullable().optional(),
        selected: z.boolean(),
      })).length(25),
    }),
  }),
});

export const newRoundErrorSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  details: z
    .object({
      validationErrors: z
        .array(
          z.object({
            path: z.string(),
            message: z.string(),
          }),
        )
        .optional(),
    })
    .optional(),
});

export type ValidatedNewRoundRequest = z.infer<typeof newRoundRequestSchema>;
export type NewRoundResponse = z.infer<typeof newRoundResponseSchema>;
export type NewRoundErrorResponse = z.infer<typeof newRoundErrorSchema>;

export type Dependencies = {
  createRound: RoundCreationService;
};

export const newRoundController = ({ createRound }: Dependencies) => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validationResult = newRoundRequestSchema.safeParse({
        params: req.params,
        auth: req.auth,
      });

      if (!validationResult.success) {
        res.status(400).json({
          success: false,
          error: "Invalid request parameters",
          details: {
            code: "validation-error",
            validationErrors: validationResult.error.errors.map((err) => ({
              path: err.path.join("."),
              message: err.message,
            })),
          },
        });
        return;
      }

      const { params, auth } = validationResult.data;

      const result = await createRound({
        gameId: params.gameId,
        userId: auth.userId,
      });

      if (!result.success) {
        const errorResponse: NewRoundErrorResponse = {
          success: false,
          error: result.message,
        };
        if (result.validationErrors) {
          errorResponse.details = { validationErrors: result.validationErrors };
        }
        res.status(pickStatus(result)).json(errorResponse);
        return;
      }

      res.status(201).json({
        success: true,
        data: {
          round: {
            roundNumber: result.data.roundNumber,
            status: result.data.status,
            createdAt: result.data.createdAt,
            cards: result.data.cards,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  };
};
