import { describe, expect, it } from 'vitest';
import { ErrorCode } from '@leaves/shared/enums';

describe('ErrorCode', () => {
  it('maps every key to the same string value', () => {
    for (const [key, value] of Object.entries(ErrorCode)) {
      expect(value).toBe(key);
    }
  });
});
