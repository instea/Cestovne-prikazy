import 'reflect-metadata';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { OpenAPIObject } from '@nestjs/swagger';
import { AppModule } from '../app.module';
import { type AppConfig, loadConfig } from '../config/env.schema';
import { buildOpenApiDocument } from './openapi';

/**
 * DOC-02: the document of the committed `docs/api/openapi.json` (written by
 * `src/generate-openapi.ts`). Boots `AppModule` in Nest preview mode (module
 * graph and controllers only: no provider runs, so no database, SMTP or
 * network) with a placeholder production config, i.e. the routes production
 * serves (no explorer). The document does not depend on config values.
 */

/** Placeholder values only; nothing connects anywhere. */
export const GENERATE_CONFIG_ENV: Readonly<Record<string, string>> = {
  NODE_ENV: 'production',
  BASE_URL: 'https://leaves.example/',
  MONGO_URL: 'mongodb://unused/leaves',
  HOSTED_DOMAIN: 'example.com',
  GOOGLE_CLIENT_ID: 'unused',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
  SMTP_HOST: 'unused',
  SMTP_PORT: '25',
  SMTP_SECURE: 'false',
  SMTP_USER: 'unused',
  SMTP_PASSWORD: 'unused',
  MAIL_SENDER: 'unused@example.com',
  APPROVAL_MAIL_RECEIVER: 'unused@example.com',
  M2M_USERNAME: 'unused',
  M2M_PASSWORD: 'unused',
  SSO_URI: 'https://sso.example/api',
  SSO_USERNAME: 'unused',
  SSO_PASSWORD: 'unused',
  LOG_LEVEL: 'fatal',
};

/** The committed file, relative to `apps/api/{src,dist}/docs`. */
export const OPENAPI_FILE = resolve(
  __dirname,
  '../../../../docs/api/openapi.json',
);

export async function generateOpenApiDocument(
  config: AppConfig = loadConfig(GENERATE_CONFIG_ENV),
): Promise<OpenAPIObject> {
  const app = await NestFactory.create(AppModule.forRoot(config), {
    preview: true,
    logger: false,
    abortOnError: false,
  });
  try {
    return buildOpenApiDocument(app);
  } finally {
    await app.close();
  }
}
