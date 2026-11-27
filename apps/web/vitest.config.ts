import react from '@vitejs/plugin-react';
import { defineProject } from 'vitest/config';
import { sharedSourceAlias } from '../../vitest.shared.js';

export default defineProject({
  plugins: [react()],
  resolve: { alias: sharedSourceAlias },
  define: { __APP_VERSION__: JSON.stringify('1.2.3-test') },
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['src/**/*.spec.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
  },
});
