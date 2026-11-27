import { describe, expect, it } from 'vitest';
import { assertE2eDbName, assertE2eMongoUrl, mongoUrlDbName } from './db-guard';

// TST-03: the E2E reset only ever runs against the `cestaky-e2e` database
// (unit-tested in the `docs` vitest project; Playwright ignores this file).
describe('E2E database guard', () => {
  it('accepts the E2E database', () => {
    for (const url of [
      'mongodb://localhost:27018/cestaky-e2e?directConnection=true',
      'mongodb://user:p%40ss@localhost:27018/cestaky-e2e',
      'mongodb://a:1,b:2/cestaky-e2e?replicaSet=rs0',
      'mongodb+srv://cluster.example.com/cestaky-e2e',
    ]) {
      expect(assertE2eMongoUrl(url)).toBe(url);
    }
  });

  it.each([
    ['dev database', 'mongodb://localhost:27017/cestaky?directConnection=true'],
    ['integration test database', 'mongodb://localhost:27017/test_abc123'],
    ['no database (driver default "test")', 'mongodb://localhost:27018'],
    ['empty path', 'mongodb://localhost:27018/?directConnection=true'],
    ['prefix only', 'mongodb://localhost:27018/cestaky-e2e-old'],
    ['case differs', 'mongodb://localhost:27018/Cestaky-E2E'],
    ['name only in the query', 'mongodb://h/prod?appName=cestaky-e2e'],
  ])('refuses the %s', (_label, url) => {
    expect(() => assertE2eMongoUrl(url)).toThrow(
      /Refusing to touch MongoDB database .*only runs against "cestaky-e2e"/,
    );
  });

  it('refuses a string that is not a MongoDB URL', () => {
    expect(() => assertE2eMongoUrl('http://localhost/cestaky-e2e')).toThrow(
      /not a MongoDB connection string/,
    );
  });

  it('never prints credentials', () => {
    expect(() =>
      assertE2eMongoUrl('mongodb://admin:s3cret@prod:27017/cestaky'),
    ).toThrow(/mongodb:\/\/\*\*\*@prod:27017\/cestaky/);
    expect(() =>
      assertE2eMongoUrl('mongodb://admin:s3cret@prod:27017/cestaky'),
    ).not.toThrow(/s3cret/);
  });

  it('decodes the database name and checks the driver-resolved name', () => {
    expect(mongoUrlDbName('mongodb://h/cestaky%2De2e')).toBe('cestaky-e2e');
    expect(() => assertE2eDbName('cestaky-e2e', 'driver')).not.toThrow();
    expect(() => assertE2eDbName('test', 'driver')).toThrow(/"test"/);
  });
});
