export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Returns `error.status` when the thrown error carries an HTTP status (e.g.
 * `ApiError`), 500 otherwise. Keeps error responses bounded: internal details
 * never leak to clients.
 */
export const apiErrorStatus = (error: unknown): number =>
  typeof (error as { status?: unknown } | null)?.status === 'number'
    ? (error as { status: number }).status
    : 500;

/**
 * Only 4xx `ApiError` messages are safe to echo to clients; any 5xx (or
 * non-ApiError) failure is collapsed to a stable `internal-error` token so
 * Prisma/SDK internals never reach the response body.
 */
export const apiErrorMessage = (error: unknown): string => {
  const status = apiErrorStatus(error);
  return status < 500 && error instanceof Error && error.message
    ? error.message
    : 'internal-error';
};
