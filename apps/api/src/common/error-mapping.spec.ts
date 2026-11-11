import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  PayloadTooLargeException,
  UnauthorizedException,
} from '@nestjs/common';
import { ErrorCode } from '@leaves/shared/enums';
import { describe, expect, it } from 'vitest';
import { AppException } from './app-exception';
import { toErrorBody, unsupportedBodyError } from './error-mapping';

describe('toErrorBody', () => {
  it('returns an AppException body as is', () => {
    const e = new AppException(409, ErrorCode.VALIDATION_FAILED, 'Custom text');
    expect(toErrorBody(e)).toEqual({
      statusCode: 409,
      code: 'VALIDATION_FAILED',
      message: 'Custom text',
    });
  });

  it.each([
    [
      new BadRequestException('Bad thing'),
      400,
      'VALIDATION_FAILED',
      'Bad thing',
    ],
    [
      new BadRequestException(['first constraint', 'second']),
      400,
      'VALIDATION_FAILED',
      'first constraint',
    ],
    [
      new UnauthorizedException(),
      401,
      'AUTH_REQUIRED',
      'Authentication required',
    ],
    [new ForbiddenException(), 403, 'FORBIDDEN', 'Forbidden'],
    [
      new NotFoundException('Cannot GET /api/nope'),
      404,
      'NOT_FOUND',
      'Route not found',
    ],
  ])('maps bare %o', (e, statusCode, code, message) => {
    expect(toErrorBody(e)).toEqual({ statusCode, code, message });
  });

  it.each([
    new ConflictException(),
    new PayloadTooLargeException(),
    new HttpException('teapot', 418),
    new Error('boom'),
    'a string',
    undefined,
  ])('maps anything else (%o) to 500 INTERNAL_ERROR', (e) => {
    expect(toErrorBody(e)).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  });

  it("maps body-parser's entity.too.large to 403 PAYLOAD_TOO_LARGE", () => {
    // What body-parser throws (http-errors PayloadTooLargeError).
    const e = Object.assign(new Error('request entity too large'), {
      type: 'entity.too.large',
      status: 413,
      statusCode: 413,
      expose: true,
      length: 204_800,
      limit: 102_400,
    });
    const body = {
      statusCode: 403,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Request body is too large',
    };
    expect(toErrorBody(e)).toEqual(body);
    // As Nest's Express adapter passes it on: a 413 HttpException with cause.
    expect(
      toErrorBody(
        new HttpException('request entity too large', 413, { cause: e }),
      ),
    ).toEqual(body);
  });

  it.each([
    [
      'charset.unsupported',
      'unsupported charset "LATIN2"',
      'Unsupported request body charset',
    ],
    [
      'encoding.unsupported',
      'unsupported content encoding "foo"',
      'Unsupported request body content encoding',
    ],
  ])(
    "maps body-parser's 415 %s to 400 VALIDATION_FAILED",
    (type, reason, message) => {
      // What body-parser throws (http-errors UnsupportedMediaTypeError).
      const e = Object.assign(new Error(reason), {
        type,
        status: 415,
        statusCode: 415,
        expose: true,
      });
      const body = { statusCode: 400, code: 'VALIDATION_FAILED', message };
      expect(toErrorBody(e)).toEqual(body);
      // As Nest's Express adapter may pass it on: an HttpException with cause.
      expect(toErrorBody(new HttpException(reason, 415, { cause: e }))).toEqual(
        body,
      );
      expect(unsupportedBodyError(e)).toEqual({ body, reason });
    },
  );

  it('maps any other 415 to 500 and finds no unsupported body', () => {
    const e = new HttpException('Unsupported Media Type', 415);
    expect(toErrorBody(e).statusCode).toBe(500);
    expect(unsupportedBodyError(e)).toBeNull();
    expect(unsupportedBodyError(undefined)).toBeNull();
  });

  it('maps an unmapped Mongo duplicate key error to 500', () => {
    const e = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    expect(toErrorBody(e).statusCode).toBe(500);
  });
});
