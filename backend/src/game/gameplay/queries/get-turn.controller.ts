import type { Response } from "express";
import type { Request } from "express-jwt";
import type { AppLogger } from "@backend/shared/logging";
import { z } from "zod";
import { GetTurnService, ApiTurnData } from "./get-turn.service";

const getTurnRequestSchema = z.object({
  params: z.object({
    turnId: z.string().uuid("Turn ID must be a valid UUID"),
  }),
  auth: z.object({
    userId: z.number().int().positive("User ID must be a positive integer"),
  }),
});

type ValidatedGetTurnRequest = z.infer<typeof getTurnRequestSchema>;

interface GetTurnApiResponse {
  success: true;
  data: {
    turn: ApiTurnData;
    historicTurns: ApiTurnData[];
  };
}

/**
 * `GET /api/turns/:turnId` — returns a single turn plus all sibling turns
 * in the same round.
 *
 * 400 on a non-UUID `turnId`, 404 when the turn is missing, 403 when an
 * `UnauthorizedTurnAccessError` bubbles up from the service.
 */
export const controller =
  (logger: AppLogger) =>
  (getTurnService: GetTurnService) =>
  async (req: Request, res: Response): Promise<void> => {
    try {
      const validationResult = getTurnRequestSchema.safeParse({
        params: req.params,
        auth: req.auth, // gameId and userId from auth middleware
      });

      if (!validationResult.success) {
        res.status(400).json({
          success: false,
          error: "Invalid request parameters",
          details: validationResult.error.errors,
        });
        return;
      }

      const { params, auth }: ValidatedGetTurnRequest = validationResult.data;

      const result = await getTurnService(params.turnId);

      if (!result) {
        res.status(404).json({
          success: false,
          error: "Turn not found",
        });
        return;
      }

      const response: GetTurnApiResponse = {
        success: true,
        data: {
          turn: result.turn,
          historicTurns: result.historicTurns,
        },
      };

      res.status(200).json(response);
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === "UnauthorizedTurnAccessError"
      ) {
        res.status(403).json({
          success: false,
          error: "Access denied to this turn",
        });
        return;
      }

      logger.error("Error in getTurn controller", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  };
