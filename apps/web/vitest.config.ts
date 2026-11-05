import react from '@vitejs/plugin-react';
import { defineProject } from 'vitest/config';
import { sharedSourceAlias } from '../../vitest.shared.js';

export default defineProject({
  plugins: [react()],
  resolve: { alias: sharedSourceAlias },
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['src/**/*.spec.{ts,tsx}'],
  },
});
