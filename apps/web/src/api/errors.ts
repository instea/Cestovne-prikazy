/** Error thrown by `api()` for any non-2xx response or network failure. */
export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function parseApiError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { code?: unknown; message?: unknown };
    if (typeof body.code === 'string') {
      return new ApiError(
        res.status,
        body.code,
        typeof body.message === 'string' ? body.message : body.code,
      );
    }
  } catch {
    // fall through: body is not JSON
  }
  return new ApiError(res.status, 'UNKNOWN', res.statusText || 'Unknown error');
}
