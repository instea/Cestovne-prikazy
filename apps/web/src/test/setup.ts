import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { sessionStore } from '../auth/session';
import { i18n } from '../i18n';
import { fakeGis, installFakeGis } from './fake-gis';
import { server } from './server';

beforeAll(() => {
  installFakeGis();
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(async () => {
  cleanup();
  server.resetHandlers();
  sessionStore.reset();
  fakeGis.reset();
  localStorage.clear();
  await i18n.changeLanguage('en');
});
afterAll(() => server.close());
