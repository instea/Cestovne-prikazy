import { type APIRequestContext, expect, request } from '@playwright/test';
import { BASE_URL } from './env';
import { fakeToken, type Persona } from './personas';

/**
 * TST-03 seeding through the real API (no test-only endpoints): each client
 * logs a persona in with a fake Google token and sends its access token as
 * Bearer. Only the fields the suite reads are typed.
 */

export type LeaveTypeName =
  'ANNUAL' | 'SICKNESS' | 'DOCTOR' | 'MATERNITY' | 'PARENTAL' | 'CARING';

export interface Leave {
  id: string;
  requesterId: string;
  type: LeaveTypeName;
  state: 'PENDING' | 'APPROVED' | 'REJECTED';
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
  numDays: number;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  surname: string;
  isAdmin: boolean;
  active: boolean;
}

export interface NewLeave {
  startDate: string;
  endDate?: string;
  type?: LeaveTypeName;
  isHalfDay?: boolean;
}

export class ApiClient {
  private constructor(
    private readonly http: APIRequestContext,
    private readonly accessToken: string,
    readonly user: User,
  ) {}

  /** Logs `persona` in (registers an unknown account, AUTH-01). */
  static async login(persona: Persona): Promise<ApiClient> {
    const http = await request.newContext({ baseURL: BASE_URL });
    const res = await http.post('/api/auth/google', {
      data: { idToken: fakeToken(persona) },
    });
    if (!res.ok()) {
      const body = await res.text();
      await http.dispose();
      throw new Error(`login ${persona.email}: ${res.status()} ${body}`);
    }
    const session = (await res.json()) as { accessToken: string; user: User };
    return new ApiClient(http, session.accessToken, session.user);
  }

  private async call<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    data?: unknown,
  ): Promise<T> {
    const res = await this.http.fetch(url, {
      method,
      headers: { Authorization: `Bearer ${this.accessToken}` },
      ...(data === undefined ? {} : { data }),
    });
    expect(res.ok(), `${method} ${url}: ${await res.text()}`).toBe(true);
    return res.status() === 204 ? (undefined as T) : ((await res.json()) as T);
  }

  createLeave(leave: NewLeave): Promise<Leave> {
    return this.call<Leave>('POST', '/api/leaves', {
      type: leave.type ?? 'ANNUAL',
      startDate: leave.startDate,
      endDate: leave.endDate ?? leave.startDate,
      isHalfDay: leave.isHalfDay ?? false,
    });
  }

  approve(leaveId: string): Promise<Leave> {
    return this.call<Leave>('POST', `/api/leaves/${leaveId}/approve`);
  }

  reject(leaveId: string): Promise<Leave> {
    return this.call<Leave>('POST', `/api/leaves/${leaveId}/reject`);
  }

  deleteLeave(leaveId: string): Promise<void> {
    return this.call<void>('DELETE', `/api/leaves/${leaveId}`);
  }

  pendingLeaves(): Promise<Leave[]> {
    return this.call<Leave[]>('GET', '/api/leaves?state=PENDING');
  }

  getUser(id: string): Promise<User> {
    return this.call<User>('GET', `/api/users/${id}`);
  }

  updateUser(
    id: string,
    changes: Partial<Pick<User, 'firstName' | 'surname' | 'isAdmin'>>,
  ): Promise<User> {
    return this.call<User>('PATCH', `/api/users/${id}`, changes);
  }

  deactivateUser(id: string): Promise<User> {
    return this.call<User>('POST', `/api/users/${id}/deactivate`);
  }

  dispose(): Promise<void> {
    return this.http.dispose();
  }
}
