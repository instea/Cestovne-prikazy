import { describe, expect, it } from 'vitest';
import { normalizeHost, sameDatabase } from './same-database';

describe('sameDatabase (MIG-01 / MIG-02 guard)', () => {
  const at = (host: string, port?: number | string, name = 'cestaky') => ({
    host,
    port,
    name,
  });

  it.each([
    ['localhost', '127.0.0.1'],
    ['localhost', '::1'],
    ['127.0.0.1', '[::1]'],
    ['LOCALHOST', 'localhost'],
    ['Mongo.Example', 'mongo.example'],
    ['mongo.example.', 'mongo.example'],
  ])('%s and %s are the same host', (a, b) => {
    expect(normalizeHost(a)).toBe(normalizeHost(b));
    expect(sameDatabase(at(a, 27017), at(b, 27017))).toBe(true);
  });

  it('an omitted port is the default 27017', () => {
    expect(sameDatabase(at('localhost'), at('127.0.0.1', 27017))).toBe(true);
    expect(sameDatabase(at('localhost', '27017'), at('localhost'))).toBe(true);
    expect(sameDatabase(at('localhost'), at('localhost', 27018))).toBe(false);
  });

  it('database names compare case-insensitively', () => {
    expect(
      sameDatabase(at('localhost', 27017, 'Cestaky'), at('localhost', 27017)),
    ).toBe(true);
  });

  it('different hosts, ports or databases are different', () => {
    expect(sameDatabase(at('localhost'), at('mongo'))).toBe(false);
    expect(sameDatabase(at('127.0.0.2'), at('127.0.0.1'))).toBe(false);
    expect(
      sameDatabase(
        at('localhost', 27017, 'cestaky_legacy'),
        at('localhost', 27017, 'cestaky'),
      ),
    ).toBe(false);
  });
});
