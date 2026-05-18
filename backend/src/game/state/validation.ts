import { z, ZodSchema } from "zod";
import { GameAggregate } from "./types";

/**
 * Branded version of a Zod-inferred type.
 *
 * The brand makes it impossible to construct a `ValidatedGameState` outside
 * of `validateWithZodSchema`, so functions that take one are guaranteed to
 * have received a parsed (not raw) aggregate.
 */
export type ValidatedGameState<T extends ZodSchema> = z.infer<T> & {
  readonly __brand: unique symbol;
};

/** Tagged result for a validation attempt — either branded data or errors. */
export type GameplayValidationResult<T> =
  | { valid: true; data: T }
  | { valid: false; errors: GameplayValidationError[] };

/**
 * Flattened Zod issue with dotted-path notation.
 *
 * `code` mirrors `ZodIssueCode` for callers that want to discriminate
 * between literal mismatch, refinement failure, etc.
 */
export type GameplayValidationError = {
  path: string;
  message: string;
  code?: string;
};

/**
 * Runs a Zod schema as a gameplay validator.
 *
 * Returns the branded parsed result on success or a list of flattened
 * issues on failure. Doesn't throw on parse error — parse failures are
 * expected, not exceptional.
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
 * Chains multiple validators, accumulating their brands.
 *
 * Stops at the first failure and returns those errors. The result type is
 * the intersection of all validator output types — note that incompatible
 * brands can produce impossible types that look fine at compile time but
 * fail at runtime, so chain only validators known to be compatible.
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
