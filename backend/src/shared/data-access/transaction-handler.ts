import type { Kysely, Transaction } from "kysely";
import type { DB } from "../db/db.types";

/** A live Kysely connection scoped to the app DB. */
export type DbContext = Kysely<DB>;

/** A Kysely transaction scoped to the app DB. */
export type TransactionContext = Transaction<DB>;

/**
 * Creates a transactional handler that executes operations within database transactions
 *
 * The handler ensures all operations run atomically - if any operation fails,
 * the entire transaction is rolled back.
 *
 * @template TOperations - Type of operations object returned by createOperations
 * @param db - Database connection for creating transactions
 * @param createOperations - Factory function that creates operations using transaction context
 * @returns Handler function that executes operations within a transaction
 *
 * @example
 * ```typescript
 * const handler = createTransactionalHandler(db, (trx) => ({
 *   createUser: userRepo.create(trx),
 *   sendEmail: emailService.send(trx)
 * }));
 *
 * await handler(async (ops) => {
 *   const user = await ops.createUser({...});
 *   await ops.sendEmail(user.email);
 * });
 * ```
 */
export const createTransactionalHandler = <TOperations>(
  db: DbContext,
  createOperations: (trx: TransactionContext) => TOperations,
): TransactionalHandler<TOperations> => {
  return async <TResult>(
    operation: (ops: TOperations) => Promise<TResult>,
  ): Promise<TResult> => {
    return await db.transaction().execute(async (trx) => {
      const operations = createOperations(trx);
      return await operation(operations);
    });
  };
};

/** Signature for a handler returned by `createTransactionalHandler`. */
export type TransactionalHandler<TOperations> = <TResult>(
  operation: (ops: TOperations) => Promise<TResult>,
) => Promise<TResult>;
