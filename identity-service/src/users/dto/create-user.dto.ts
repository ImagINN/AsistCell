import { IsEnum } from 'class-validator';
import { Role } from '@prisma/client';
import { RegisterDto } from '../../auth/dto/register.dto';

// Admin'in doğrudan rolüyle hesap oluşturması için (temsilci/süpervizör)
export class CreateUserDto extends RegisterDto {
  @IsEnum(Role, { message: 'Role must be one of USER, TEMSILCI, SUPERVIZOR, ADMIN' })
  role: Role;
}
