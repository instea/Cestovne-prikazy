import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'auth:isPublic';

/**
 * Opts a route or controller out of the global access-token guard (NFR-01
 * deny-by-default). Cookie-authenticated and M2M routes are `@Public()` and
 * do their own checks.
 */
export const Public = () => SetMetadata(IS_PUBLIC, true);
