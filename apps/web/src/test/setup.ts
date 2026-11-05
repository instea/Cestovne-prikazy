import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { sessionStore } from '../auth/session';
import { i18n } from '../i18n';
import { server } from './server';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(async () => {
  cleanup();
  server.resetHandlers();
  sessionStore.reset();
  localStorage.clear();
  await i18n.changeLanguage('en');
});
afterAll(() => server.close());
