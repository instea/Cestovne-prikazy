/** API data transfer objects shared by api and web. Dates are ISO-8601 strings. */

/** DATA-01 `UserDto`. */
export interface UserDto {
  id: string;
  email: string;
  firstName: string;
  surname: string;
  isAdmin: boolean;
  active: boolean;
  deactivatedAt: string | null;
  anonymizedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** AUTH-01 / AUTH-02 session response (login and refresh). */
export interface SessionDto {
  accessToken: string;
  accessTokenExpiresAt: string;
  user: UserDto;
}

/** AUTH-01 `GET /api/auth/config`. */
export interface AuthConfigDto {
  googleClientId: string;
  hostedDomain: string;
}
