import { describe, expect, it } from 'vitest';
import { appInfo } from './app-info';

describe('appInfo', () => {
  it('uses the shared app name', () => {
    expect(appInfo()).toBe('Leaves API');
  });
});
