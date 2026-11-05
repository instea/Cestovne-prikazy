import { describe, expect, it } from 'vitest';
import { ConfigError, isSmtpConfigured, loadConfig } from './env.schema';

/** Minimal env valid in every NODE_ENV except production. */
const base = {
  HOSTED_DOMAIN: 'instea.co',
  GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};

/** Full env valid in production. */
const prod = {
  ...base,
  NODE_ENV: 'production',
  BASE_URL: 'https://cestaky.instea.co',
  MONGO_URL: 'mongodb://mongo:27017/cestaky',
  SMTP_HOST: 'smtp.gmail.com',
  SMTP_PORT: '465',
  SMTP_SECURE: 'true',
  SMTP_USER: 'leaves@instea.co',
  SMTP_PASSWORD: 'secret',
  MAIL_SENDER: 'leaves@instea.co',
  APPROVAL_MAIL_RECEIVER: 'approver@instea.co',
  M2M_USERNAME: 'm2m',
  M2M_PASSWORD: 'm2m-secret',
  SSO_URI: 'https://sso.instea.co/api/meta/all',
  SSO_USERNAME: 'sso',
  SSO_PASSWORD: 'sso-secret',
};

function errorOf(env: Record<string, string>): ConfigError {
  try {
    loadConfig(env);
  } catch (e) {
    if (e instanceof ConfigError) return e;
    throw e;
  }
  throw new Error('expected ConfigError');
}

describe('loadConfig', () => {
  it('applies non-production defaults', () => {
    const c = loadConfig(base);
    expect(c).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4100,
      BASE_URL: 'http://localhost:5173',
      MONGO_URL: 'mongodb://localhost:27017/cestaky',
      ACCESS_TOKEN_TTL_SECONDS: 900,
      REFRESH_TOKEN_TTL_SECONDS: 604800,
      AUTH_GOOGLE_VERIFIER: 'google',
      SMTP_HOST: 'localhost',
      SMTP_PORT: 1025,
      SMTP_SECURE: false,
      MAIL_SENDER: 'leaves@localhost',
      APPROVAL_MAIL_RECEIVER: 'approver@localhost',
      DEFAULT_TIMEZONE: 'Europe/Bratislava',
      TOGGL_REPORTS_BASE_URL: 'https://api.track.toggl.com/reports/api/v3',
      LOG_LEVEL: 'debug',
      APP_VERSION: '0.0.0-dev',
    });
    expect(c.SMTP_USER).toBeUndefined();
    expect(c.M2M_USERNAME).toBeUndefined();
  });

  it('defaults LOG_LEVEL to info outside development', () => {
    expect(loadConfig({ ...base, NODE_ENV: 'test' }).LOG_LEVEL).toBe('info');
    expect(loadConfig(prod).LOG_LEVEL).toBe('info');
  });

  it('accepts a complete production env', () => {
    const c = loadConfig(prod);
    expect(c.SMTP_PORT).toBe(465);
    expect(c.SMTP_SECURE).toBe(true);
  });

  it.each(Object.keys(prod).filter((k) => k !== 'NODE_ENV'))(
    'requires %s in production',
    (key) => {
      const env: Record<string, string> = { ...prod };
      delete env[key];
      expect(errorOf(env).problems).toContain(`${key} is required`);
    },
  );

  it.each(['HOSTED_DOMAIN', 'GOOGLE_CLIENT_ID', 'JWT_ACCESS_SECRET'])(
    'requires %s outside production too',
    (key) => {
      const env: Record<string, string> = { ...base };
      delete env[key];
      expect(errorOf(env).problems).toContain(`${key} is required`);
    },
  );

  it('formats the message as "Invalid configuration: …"', () => {
    const env: Record<string, string> = { ...prod };
    delete env.GOOGLE_CLIENT_ID;
    expect(errorOf(env).message).toBe(
      'Invalid configuration: GOOGLE_CLIENT_ID is required',
    );
  });

  it('does not fall back to the old CLIENT_ID name', () => {
    const env: Record<string, string> = { ...prod, CLIENT_ID: 'old' };
    delete env.GOOGLE_CLIENT_ID;
    expect(errorOf(env).problems).toEqual(['GOOGLE_CLIENT_ID is required']);
  });

  it('treats empty strings as unset', () => {
    expect(errorOf({ ...prod, SMTP_USER: '' }).problems).toEqual([
      'SMTP_USER is required',
    ]);
  });

  it('reports every problem at once', () => {
    expect(errorOf({ NODE_ENV: 'production' }).problems.length).toBeGreaterThan(
      10,
    );
  });

  it('rejects AUTH_GOOGLE_VERIFIER=fake in production', () => {
    expect(
      errorOf({ ...prod, AUTH_GOOGLE_VERIFIER: 'fake' }).problems,
    ).toContain('AUTH_GOOGLE_VERIFIER=fake is not allowed in production');
    expect(
      loadConfig({ ...base, AUTH_GOOGLE_VERIFIER: 'fake' })
        .AUTH_GOOGLE_VERIFIER,
    ).toBe('fake');
  });

  it('rejects an invalid timezone', () => {
    expect(
      errorOf({ ...base, DEFAULT_TIMEZONE: 'Mars/Olympus' }).problems,
    ).toContain('DEFAULT_TIMEZONE must be a valid IANA timezone');
  });

  it('rejects a JWT secret shorter than 32 bytes', () => {
    expect(errorOf({ ...base, JWT_ACCESS_SECRET: 'short' }).problems).toContain(
      'JWT_ACCESS_SECRET must be at least 32 bytes',
    );
  });

  it.each([
    ['PORT', 'abc'],
    ['ACCESS_TOKEN_TTL_SECONDS', '0'],
    ['REFRESH_TOKEN_TTL_SECONDS', '-5'],
    ['SMTP_PORT', '1.5'],
  ])('rejects %s=%s', (key, value) => {
    expect(errorOf({ ...base, [key]: value }).problems).toContain(
      `${key} must be a positive integer`,
    );
  });

  it.each([
    ['NODE_ENV', 'staging'],
    ['LOG_LEVEL', 'verbose'],
    ['AUTH_GOOGLE_VERIFIER', 'other'],
  ])('rejects %s=%s', (key, value) => {
    expect(errorOf({ ...base, [key]: value }).problems[0]).toMatch(
      new RegExp(`^${key} must be one of `),
    );
  });

  it.each(['BASE_URL', 'TOGGL_REPORTS_BASE_URL', 'SSO_URI'])(
    'rejects a non-URL %s',
    (key) => {
      expect(errorOf({ ...base, [key]: 'not a url' }).problems).toContain(
        `${key} must be an absolute URL`,
      );
    },
  );

  it('keeps optional LEGACY_MONGO_URL', () => {
    expect(
      loadConfig({ ...base, LEGACY_MONGO_URL: 'mongodb://old/data' })
        .LEGACY_MONGO_URL,
    ).toBe('mongodb://old/data');
  });

  describe('SMTP (NOT-01)', () => {
    const smtp = {
      SMTP_HOST: 'mailpit',
      SMTP_PORT: '1025',
      SMTP_USER: 'u',
      SMTP_PASSWORD: 'p',
    };

    it('rejects a configured SMTP without MAIL_SENDER', () => {
      expect(errorOf({ ...base, ...smtp }).problems).toEqual([
        'MAIL_SENDER is required when SMTP is configured',
      ]);
      expect(errorOf({ ...base, ...smtp, MAIL_SENDER: '' }).problems).toEqual([
        'MAIL_SENDER is required when SMTP is configured',
      ]);
    });

    it('accepts a configured SMTP with MAIL_SENDER', () => {
      const c = loadConfig({ ...base, ...smtp, MAIL_SENDER: 'leaves@x.test' });
      expect(c).toMatchObject({
        SMTP_HOST: 'mailpit',
        SMTP_PORT: 1025,
        MAIL_SENDER: 'leaves@x.test',
      });
      expect(isSmtpConfigured(c)).toBe(true);
    });

    it.each(['SMTP_USER', 'SMTP_PASSWORD'])(
      'does not require MAIL_SENDER when %s is missing (not configured)',
      (key) => {
        const env: Record<string, string> = { ...base, ...smtp, [key]: '' };
        const c = loadConfig(env);
        expect(c.MAIL_SENDER).toBe('leaves@localhost');
        expect(isSmtpConfigured(c)).toBe(false);
      },
    );

    it.each([
      ['SMTP_HOST', 'localhost'],
      ['SMTP_PORT', 1025],
    ] as const)(
      'non-prod: a missing %s falls back to Mailpit (SET-02 default)',
      (key, fallback) => {
        const c = loadConfig({ ...base, ...smtp, [key]: '' });
        expect(c[key]).toBe(fallback);
        expect(c.MAIL_SENDER).toBe('leaves@localhost');
        expect(isSmtpConfigured(c)).toBe(true);
      },
    );

    it.each([
      ['true', true],
      ['false', false],
      ['TRUE', false],
      ['1', false],
      ['yes', false],
    ] as const)('SMTP_SECURE=%s gives secure=%s', (value, secure) => {
      expect(loadConfig({ ...base, SMTP_SECURE: value }).SMTP_SECURE).toBe(
        secure,
      );
    });

    it('rejects a non-integer SMTP_PORT even when MAIL_SENDER is set', () => {
      expect(
        errorOf({ ...base, ...smtp, SMTP_PORT: 'abc', MAIL_SENDER: 's@x' })
          .problems,
      ).toEqual(['SMTP_PORT must be a positive integer']);
    });
  });
});

describe('isSmtpConfigured', () => {
  const full = {
    SMTP_HOST: 'h',
    SMTP_PORT: 25,
    SMTP_USER: 'u',
    SMTP_PASSWORD: 'p',
  } as const;
  const keys = Object.keys(full) as (keyof typeof full)[];
  // Every subset of missing vars (2^4 - 1 combinations).
  const missingSets = Array.from({ length: 15 }, (_, i) =>
    keys.filter((_, bit) => ((i + 1) >> bit) & 1),
  );

  it('is true only when all four are non-empty', () => {
    expect(isSmtpConfigured(full)).toBe(true);
  });

  it.each(missingSets.map((m) => [m.join('+'), m] as const))(
    'is false when %s missing',
    (_label, missing) => {
      const asUndefined: Record<string, unknown> = { ...full };
      const asEmpty: Record<string, unknown> = { ...full };
      for (const k of missing) {
        asUndefined[k] = undefined;
        asEmpty[k] = k === 'SMTP_PORT' ? 0 : '';
      }
      expect(isSmtpConfigured(asUndefined as never)).toBe(false);
      expect(isSmtpConfigured(asEmpty as never)).toBe(false);
    },
  );
});
