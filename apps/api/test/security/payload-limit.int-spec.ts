import { ErrorCode } from '@leaves/shared/enums';
import { describe, expect, it } from 'vitest';
import { useTestApp } from '../support/app';
import { loginAs } from '../support/auth';
import { seedUser } from '../support/seed';

/**
 * SET-02 (user decision 2026-11-09): a JSON body over the 100 KB limit is
 * 403 `PAYLOAD_TOO_LARGE` on every API route, before auth and validation;
 * a body under the limit is handled normally.
 */
const ctx = useTestApp();

const BIG = 'x'.repeat(200 * 1024);
const TOO_LARGE = {
  statusCode: 403,
  code: ErrorCode.PAYLOAD_TOO_LARGE,
  message: 'Request body is too large',
};

describe('JSON body limit (SET-02)', () => {
  it.each([
    ['PATCH', '/api/users/me', { firstName: BIG }],
    ['POST', '/api/leaves', { type: 'D8', description: BIG }],
  ] as const)(
    '%s %s with a 200 KB body is 403 PAYLOAD_TOO_LARGE',
    async (method, path, body) => {
      const user = await seedUser(ctx().app);
      const { accessToken } = await loginAs(ctx().app, user);
      const agent = ctx().request();
      const req = method === 'PATCH' ? agent.patch(path) : agent.post(path);
      const res = await req
        .set('Authorization', `Bearer ${accessToken}`)
        .send(body);
      expect(res.status).toBe(403);
      expect(res.body).toEqual(TOO_LARGE);
    },
  );

  it('answers 403 PAYLOAD_TOO_LARGE before authentication', async () => {
    const res = await ctx()
      .request()
      .patch('/api/users/me')
      .send({ firstName: BIG });
    expect(res.status).toBe(403);
    expect(res.body).toEqual(TOO_LARGE);
  });

  it('a body under the limit reaches validation as usual', async () => {
    const user = await seedUser(ctx().app);
    const { accessToken } = await loginAs(ctx().app, user);
    const res = await ctx()
      .request()
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ firstName: 'x'.repeat(50 * 1024) });
    expect(res.status).toBe(400);
    expect((res.body as { code: string }).code).toBe(
      ErrorCode.VALIDATION_FAILED,
    );
  });
});
