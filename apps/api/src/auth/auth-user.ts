import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** `request.user` set by the access-token guard, read from the DB (AUTH-02). */
export interface AuthUser {
  id: string;
  isAdmin: boolean;
  active: boolean;
}

export type AuthenticatedRequest = Request & { user?: AuthUser };

/** The authenticated caller. Only valid on routes behind the guard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const user = ctx.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user) throw new Error('CurrentUser used on a route without a user');
    return user;
  },
);
