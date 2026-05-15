import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";
import type { DealCardsService } from "./deal-cards.service";
import { pickStatus } from "@backend/shared/http/result-status";
import { z } from "zod";

export const dealCardsRequestSchema = z.object({
  params: z.object({
    gameId: z.string().min(1, "Game ID is required"),
    id: z.string().min(1, "Round ID is required"),
  }),
  auth: z.object({
    userId: z.number().int().positive("User ID must be a positive integer"),
  }),
  body: z
    .object({
      deck: z.string().min(1).default("BASE"),
      languageCode: z.string().min(2).max(5).default("en"),
      redeal: z.boolean().optional().default(false),
    })
    .optional()
    .default({}),
});

export type ValidatedDealCardsRequest = z.infer<typeof dealCardsRequestSchema>;

export type DealCardsErrorResponse = {
  success: false;
  error: string;
  details?: {
    validationErrors?: { path: string; message: string }[];
  };
};

export type DealCardsResponse = {
  success: boolean;
  data: {
    roundNumber: number;
    status: string;
    cardCount: number;
    cards: { word: string; selected: boolean }[];
  };
};

export type Dependencies = {
  dealCards: DealCardsService;
};

export const dealCardsController = ({ dealCards }: Dependencies) => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validatedRequest = dealCardsRequestSchema.parse({
        params: req.params,
        auth: req.auth,
        body: req.body || {},
      });

      const result = await dealCards({
        gameId: validatedRequest.params.gameId,
        userId: validatedRequest.auth.userId,
        redeal: validatedRequest.body.redeal,
      });

      if (!result.success) {
        const errorResponse: DealCardsErrorResponse = {
          success: false,
          error: result.message,
        };
        if (result.validationErrors) {
          errorResponse.details = { validationErrors: result.validationErrors };
        }
        res.status(pickStatus(result)).json(errorResponse);
        return;
      }

      const response: DealCardsResponse = {
        success: true,
        data: {
          roundNumber: result.data.roundNumber,
          status: "SETUP", // Cards are dealt in SETUP state
          cardCount: result.data.cards.length,
          cards: result.data.cards.map((card) => ({
            word: card.word,
            selected: card.selected,
          })),
        },
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  };
};
