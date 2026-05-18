import { z, ZodSchema } from "zod";
import { LobbyAggregate } from "./types";

/**
 * Branded version of a Zod-inferred lobby type.
 *
 * The brand makes it impossible to construct a `ValidatedLobbyState`
 * outside of `validateWithZodSchema`.
 */
export type ValidatedLobbyState<T extends ZodSchema> = z.infer<T> & {
  readonly __brand: unique symbol;
};

/** Tagged result for a lobby validation attempt. */
export type LobbyValidationResult<T> =
  | { valid: true; data: T }
  | { valid: false; errors: LobbyValidationError[] };

/** Flattened Zod issue with dotted-path notation. */
export type LobbyValidationError = {
  path: string;
  message: string;
  code?: string;
};

/**
 * Runs a Zod schema as a lobby validator.
 *
 * Returns the branded parsed result on success or a list of flattened
 * issues on failure. Doesn't throw on parse error.
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

const convertZodErrors = (error: z.ZodError): LobbyValidationError[] =>
  error.errors.map((err) => ({
    path: err.path.join("."),
    message: err.message,
    code: err.code,
  }));

type ExtractValidatedType<T> = T extends (
  data: LobbyAggregate,
) => LobbyValidationResult<infer U>
  ? U
  : never;

type IntersectValidators<T extends readonly any[]> = T extends readonly [
  infer First,
  ...infer Rest,
]
  ? ExtractValidatedType<First> & IntersectValidators<Rest>
  : unknown;

/**
 * Chains multiple lobby validators, accumulating their brands.
 *
 * Stops at the first failure. Incompatible brands produce impossible
 * intersection types — chain only validators known to be compatible.
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