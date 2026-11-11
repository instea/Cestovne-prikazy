import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Longest accepted `idToken` (validator and OpenAPI `maxLength`). */
export const ID_TOKEN_MAX_LENGTH = 4096;

/** AUTH-01 `POST /api/auth/google` body. */
export class GoogleLoginDto {
  @ApiProperty({
    description: 'Google ID token (JWT) from Google Identity Services.',
    minLength: 1,
    maxLength: ID_TOKEN_MAX_LENGTH,
  })
  @IsString({ message: 'idToken must be a string' })
  @IsNotEmpty({ message: 'idToken must not be empty' })
  @MaxLength(ID_TOKEN_MAX_LENGTH, {
    message: `idToken must be at most ${ID_TOKEN_MAX_LENGTH} characters`,
  })
  idToken!: string;
}
