import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Role, Specialty } from '@prisma/client';
import { IsStrongPassword } from '../../common/validators/password.decorator';

// Admin'in doğrudan rolüyle hesap oluşturması (temsilci/süpervizör).
// Personel e-posta + şifre ile giriş yapar; temsilcilere uzmanlık alanı atanır.
export class CreateUserDto {
  @IsEmail({}, { message: 'Geçerli bir e-posta adresi giriniz' })
  email: string;

  @IsStrongPassword()
  password: string;

  @IsString({ message: 'Ad metin olmalıdır' })
  @MinLength(2, { message: 'Ad en az 2 karakter olmalıdır' })
  @MaxLength(50, { message: 'Ad en fazla 50 karakter olabilir' })
  firstName: string;

  @IsString({ message: 'Soyad metin olmalıdır' })
  @MinLength(2, { message: 'Soyad en az 2 karakter olmalıdır' })
  @MaxLength(50, { message: 'Soyad en fazla 50 karakter olabilir' })
  lastName: string;

  @IsEnum(Role, { message: 'Rol USER, TEMSILCI, SUPERVIZOR veya ADMIN olmalıdır' })
  role: Role;

  // Temsilci için zorunlu, birden fazla seçilebilir
  @ValidateIf((o) => o.role === Role.TEMSILCI || o.specialties !== undefined)
  @IsArray({ message: 'Uzmanlık alanları liste olmalıdır' })
  @ArrayNotEmpty({ message: 'Temsilci için en az bir uzmanlık alanı seçilmelidir' })
  @IsEnum(Specialty, {
    each: true,
    message: 'Uzmanlık alanı FATURA, SEBEKE, CIHAZ, TARIFE veya IPTAL olmalıdır',
  })
  specialties?: Specialty[];
}
