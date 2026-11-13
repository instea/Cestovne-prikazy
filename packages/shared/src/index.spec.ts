import { describe, expect, it } from 'vitest';
import { APP_NAME } from '@leaves/shared';

describe('@leaves/shared', () => {
  it('resolves its own package entry from source', () => {
    expect(APP_NAME).toBe('Leaves');
  });
});
