import { IsEnum } from 'class-validator';
import { Role } from '@prisma/client';

export class UpdateRoleDto {
  @IsEnum(Role, { message: 'Role must be one of USER, TEMSILCI, SUPERVIZOR, ADMIN' })
  role: Role;
}
