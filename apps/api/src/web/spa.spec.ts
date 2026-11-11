import { describe, expect, it } from 'vitest';
import { DEFAULT_STATIC_ROOT, defaultStaticRoot } from './spa';

describe('defaultStaticRoot', () => {
  const present = () => true;
  const missing = () => false;

  it('always serves the image path in production', () => {
    expect(defaultStaticRoot('production', missing)).toBe(DEFAULT_STATIC_ROOT);
  });

  it('serves the image path with NODE_ENV=test only inside the image (TST-03)', () => {
    expect(defaultStaticRoot('test', present)).toBe(DEFAULT_STATIC_ROOT);
    expect(defaultStaticRoot('test', missing)).toBeUndefined();
  });

  it('never serves the SPA in development (Vite does)', () => {
    expect(defaultStaticRoot('development', present)).toBeUndefined();
  });
});
