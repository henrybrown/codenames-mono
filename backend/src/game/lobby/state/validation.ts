import { z, ZodSchema } from "zod";
import { LobbyAggregate } from "./types";

/**
 * Branded type for validated lobby state
 */
export type ValidatedLobbyState<T extends ZodSchema> = z.infer<T> & {
  readonly __brand: unique symbol;
};

/**
 * Validation result with discriminated union
 */
export type LobbyValidationResult<T> =
  | { valid: true; data: T }
  | { valid: false; errors: LobbyValidationError[] };

/**
 * Structured validation error
 */
export type LobbyValidationError = {
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
): LobbyValidationResult<ValidatedLobbyState<T>> => {
  const result = schema.safeParse(data);

  if (!result.success) {
    return { valid: false, errors: convertZodErrors(result.error) };
  }

  return { valid: true, data: result.data as ValidatedLobbyState<T> };
};

/**
 * Converts Zod errors to our error format
 */
const convertZodErrors = (error: z.ZodError): LobbyValidationError[] =>
  error.errors.map((err) => ({
    path: err.path.join("."),
    message: err.message,
    code: err.code,
  }));

/**
 * Extracts the validated type from a validator function
 */
type ExtractValidatedType<T> = T extends (
  data: LobbyAggregate,
) => LobbyValidationResult<infer U>
  ? U
  : never;

/**
 * Creates intersection of all validator return types
 */
type IntersectValidators<T extends readonly any[]> = T extends readonly [
  infer First,
  ...infer Rest,
]
  ? ExtractValidatedType<First> & IntersectValidators<Rest>
  : unknown;

/**
 * Chains validation functions, accumulating all validation brands
 */
export const validateAll = <
  T extends readonly [
    (data: LobbyAggregate) => LobbyValidationResult<any>,
    ...any[],
  ],
>(
  data: LobbyAggregate,
  validators: T,
): LobbyValidationResult<IntersectValidators<T>> => {
  let currentData = data;

  for (const validator of validators) {
    const result = validator(currentData);
    if (!result.valid) return result;
    currentData = result.data;
  }

  return { valid: true, data: currentData as IntersectValidators<T> };
};