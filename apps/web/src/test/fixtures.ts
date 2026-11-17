import type { SessionDto, UserDto } from '@leaves/shared/dto';

export function userDto(overrides: Partial<UserDto> = {}): UserDto {
  return {
    id: 'google-sub-1',
    email: 'jana.novak@instea.co',
    firstName: 'Jana',
    surname: 'Novák',
    isAdmin: false,
    active: true,
    deactivatedAt: null,
    anonymizedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function sessionDto(
  user: UserDto = userDto(),
  token = 'access-1',
): SessionDto {
  return {
    accessToken: token,
    accessTokenExpiresAt: '2030-01-01T00:15:00.000Z',
    user,
  };
}
