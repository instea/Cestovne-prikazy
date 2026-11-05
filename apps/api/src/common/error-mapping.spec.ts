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
import { toErrorBody } from './error-mapping';

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

  it('maps an unmapped Mongo duplicate key error to 500', () => {
    const e = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    expect(toErrorBody(e).statusCode).toBe(500);
  });
});
