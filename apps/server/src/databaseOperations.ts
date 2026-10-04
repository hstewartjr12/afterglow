let operationQueue: Promise<unknown> = Promise.resolve();

/** Keep writes outside transactions from taking a second, locked connection. */
export function serializeDatabaseOperation<T>(
  operation: () => T | PromiseLike<T>,
): Promise<T> {
  const next = operationQueue.then(operation);
  // A failed save must not prevent a later save or backup from running.
  operationQueue = next.catch(() => {});
  return next;
}
