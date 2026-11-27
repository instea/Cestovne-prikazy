import { render } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { App } from '../App';
import { createQueryClient } from '../query-client';
import { routes } from '../router';

export function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const queryClient = createQueryClient();
  const view = render(<App router={router} queryClient={queryClient} />);
  return { ...view, router, queryClient };
}
