import { z, ZodSchema } from "zod";
import { GameAggregate } from "./types";

export type ValidatedGameState<T extends ZodSchema> = z.infer<T> & {
  readonly __brand: unique symbol;
};

export type GameplayValidationResult<T> =
  | { valid: true; data: T }
  | { valid: false; errors: GameplayValidationError[] };

export type GameplayValidationError = {
  path: string;
  message: string;
  code?: string;
};

export const validateWithZodSchema = <T extends z.ZodType>(
  schema: T,
  data: unknown,
): GameplayValidationResult<ValidatedGameState<T>> => {
  const result = schema.safeParse(data);

  if (!result.success) {
    return { valid: false, errors: convertZodErrors(result.error) };
  }

  return { valid: true, data: result.data as ValidatedGameState<T> };
};

const convertZodErrors = (error: z.ZodError): GameplayValidationError[] =>
  error.errors.map((err) => ({
    path: err.path.join("."),
    message: err.message,
    code: err.code,
  }));

type ExtractValidatedType<T> = T extends (
  data: GameAggregate,
) => GameplayValidationResult<infer U>
  ? U
  : never;

type IntersectValidators<T extends readonly any[]> = T extends readonly [
  infer First,
  ...infer Rest,
]
  ? ExtractValidatedType<First> & IntersectValidators<Rest>
  : unknown;

/**
 * Chains validation functions, accumulating all validation brands..
 *
 * This can cause impossible intersection types to be generated but these will
 * fail at runtime.
 *
 * E.g.
 */
export const validateAll = <
  T extends readonly [
    (data: GameAggregate) => GameplayValidationResult<any>,
    ...any[],
  ],
>(
  data: GameAggregate,
  validators: T,
): GameplayValidationResult<IntersectValidators<T>> => {
  let currentData = data;

  for (const validator of validators) {
    const result = validator(currentData);
    if (!result.valid) return result;
    currentData = result.data;
  }

  return { valid: true, data: currentData as IntersectValidators<T> };
};
