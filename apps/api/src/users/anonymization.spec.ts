import { describe, expect, it, vi } from 'vitest';
import {
  confirmEmailMatches,
  generatePlaceholderToken,
  PLACEHOLDER_TOKEN_RETRIES,
  PlaceholderCollisionError,
  pickPlaceholderToken,
  placeholderEmail,
  placeholderIdentity,
} from './anonymization';

describe('placeholder generator (NFR-08)', () => {
  it('tokens are 8 lowercase hex characters and differ', () => {
    const tokens = new Set(
      Array.from({ length: 50 }, () => generatePlaceholderToken()),
    );
    for (const token of tokens) expect(token).toMatch(/^[0-9a-f]{8}$/);
    expect(tokens.size).toBeGreaterThan(45);
  });

  it('builds the spec placeholders (example token 3f9a1c2b)', () => {
    expect(placeholderIdentity('3f9a1c2b')).toEqual({
      email: 'anonymized-3f9a1c2b@anonymized.invalid',
      firstName: 'Anonymized',
      surname: 'User 3f9a1c2b',
    });
  });

  it('the email is lowercase, on the .invalid TLD and matches the User schema', () => {
    const email = placeholderEmail(generatePlaceholderToken());
    expect(email).toBe(email.toLowerCase());
    expect(email).toMatch(/^anonymized-[0-9a-f]{8}@anonymized\.invalid$/);
    expect(email.endsWith('.invalid')).toBe(true);
    // DATA-01 email rule (user.schema.ts).
    expect(email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  });
});

describe('pickPlaceholderToken (unique-index collision)', () => {
  it('returns the first token when its email is free', async () => {
    const generate = vi.fn().mockReturnValueOnce('aaaaaaaa');
    const taken = vi.fn().mockResolvedValue(false);
    await expect(pickPlaceholderToken(taken, generate)).resolves.toBe(
      'aaaaaaaa',
    );
    expect(taken).toHaveBeenCalledWith(
      'anonymized-aaaaaaaa@anonymized.invalid',
    );
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('regenerates on a collision', async () => {
    const generate = vi
      .fn()
      .mockReturnValueOnce('aaaaaaaa')
      .mockReturnValueOnce('bbbbbbbb');
    const taken = vi.fn((email: string) =>
      Promise.resolve(email.includes('aaaaaaaa')),
    );
    await expect(pickPlaceholderToken(taken, generate)).resolves.toBe(
      'bbbbbbbb',
    );
  });

  it('succeeds on the 3rd regeneration, fails after it', async () => {
    const attempts = 1 + PLACEHOLDER_TOKEN_RETRIES;
    expect(attempts).toBe(4);
    let n = 0;
    const generate = () => `0000000${n++}`;
    const lastFree = (email: string) =>
      Promise.resolve(!email.includes(`0000000${attempts - 1}`));
    await expect(pickPlaceholderToken(lastFree, generate)).resolves.toBe(
      '00000003',
    );

    const generateAll = vi.fn(() => 'cccccccc');
    await expect(
      pickPlaceholderToken(() => Promise.resolve(true), generateAll),
    ).rejects.toThrow(PlaceholderCollisionError);
    expect(generateAll).toHaveBeenCalledTimes(attempts);
  });
});

describe('confirmEmailMatches', () => {
  const stored = 'peter.kral@instea.co';

  it('accepts the exact email', () => {
    expect(confirmEmailMatches('peter.kral@instea.co', stored)).toBe(true);
  });

  it('accepts a different case with surrounding spaces', () => {
    expect(confirmEmailMatches('  Peter.Kral@INSTEA.co \t', stored)).toBe(true);
  });

  it('rejects a different email, an empty or blank one', () => {
    expect(confirmEmailMatches('peter.kral@instea.com', stored)).toBe(false);
    expect(confirmEmailMatches('peter kral@instea.co', stored)).toBe(false);
    expect(confirmEmailMatches('', stored)).toBe(false);
    expect(confirmEmailMatches('   ', stored)).toBe(false);
  });
});
