import { z, ZodSchema } from "zod";
import { GameAggregate } from "./gameplay-state.types";

/**
 * Branded type for validated game state
 */
export type ValidatedGameState<T extends ZodSchema> = z.infer<T> & {
  readonly __brand: unique symbol;
};

/**
 * Validation result with discriminated union
 */
export type GameplayValidationResult<T> =
  | { valid: true; data: T }
  | { valid: false; errors: GameplayValidationError[] };

/**
 * Structured validation error
 */
export type GameplayValidationError = {
  path: string;
  message: string;
  code?: string;
};

/**
 * Validates data against a Zod schema, returning branded type
 */
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

/**
 * Converts Zod errors to our error format
 */
const convertZodErrors = (error: z.ZodError): GameplayValidationError[] =>
  error.errors.map((err) => ({
    path: err.path.join("."),
    message: err.message,
    code: err.code,
  }));

/**
 * Extracts the validated type from a validator function
 */
type ExtractValidatedType<T> = T extends (
  data: GameAggregate,
) => GameplayValidationResult<infer U>
  ? U
  : never;

/**
 * Creates intersection of all validator return types...
 *
 */
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
