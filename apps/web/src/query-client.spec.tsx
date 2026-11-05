import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './api/errors';
import { createQueryClient, errorMessage } from './query-client';
import { ErrorBoundary } from './ui/ErrorPage';

describe('errorMessage', () => {
  it('translates a known code', () => {
    expect(errorMessage(new ApiError(0, 'NETWORK_ERROR', 'x'))).toBe(
      'Network error. Check your connection.',
    );
  });

  it('falls back to the server message for an unknown code', () => {
    expect(
      errorMessage(new ApiError(409, 'SOME_NEW_CODE', 'Server text')),
    ).toBe('Server text');
  });

  it('uses the generic text for non-API errors', () => {
    expect(errorMessage(new Error('x'))).toBe('Unexpected error.');
  });
});

describe('createQueryClient', () => {
  const retry = createQueryClient().getDefaultOptions().queries?.retry as (
    n: number,
    e: unknown,
  ) => boolean;

  it('does not retry 4xx and retries other errors once', () => {
    expect(retry(0, new ApiError(404, 'NOT_FOUND', 'x'))).toBe(false);
    expect(retry(0, new ApiError(500, 'INTERNAL_ERROR', 'x'))).toBe(true);
    expect(retry(1, new ApiError(500, 'INTERNAL_ERROR', 'x'))).toBe(false);
  });

  it('shows mutation errors as a toast', async () => {
    const client = createQueryClient();
    const { Toaster } = await import('./ui/toast');
    render(<Toaster />);
    await client
      .getMutationCache()
      .build(client, {
        mutationFn: () => Promise.reject(new ApiError(403, 'FORBIDDEN', 'x')),
      })
      .execute(undefined)
      .catch(() => undefined);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You are not allowed to do this.',
    );
  });
});

describe('ErrorBoundary', () => {
  it('shows the error page with Reload', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const Boom = () => {
      throw new Error('render failure');
    };
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(
      screen.getByRole('heading', { name: 'Something went wrong' }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalled();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
