import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** AUTH-01 `POST /api/auth/google` body. */
export class GoogleLoginDto {
  @IsString({ message: 'idToken must be a string' })
  @IsNotEmpty({ message: 'idToken must not be empty' })
  @MaxLength(4096, { message: 'idToken must be at most 4096 characters' })
  idToken!: string;
}
