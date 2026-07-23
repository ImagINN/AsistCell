import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsStrongPassword } from '../../common/validators/password.decorator';
import { GSM_REGEX } from '../../common/validators/gsm.util';

// Müşteri kaydı: Turkcell GSM + OTP doğrulama. E-posta opsiyoneldir.
export class RegisterDto {
  @IsString({ message: 'Ad metin olmalıdır' })
  @MinLength(2, { message: 'Ad en az 2 karakter olmalıdır' })
  @MaxLength(50, { message: 'Ad en fazla 50 karakter olabilir' })
  firstName: string;

  @IsString({ message: 'Soyad metin olmalıdır' })
  @MinLength(2, { message: 'Soyad en az 2 karakter olmalıdır' })
  @MaxLength(50, { message: 'Soyad en fazla 50 karakter olabilir' })
  lastName: string;

  @Matches(GSM_REGEX, {
    message: 'Geçerli bir GSM numarası giriniz (örn. 5XX XXX XX XX)',
  })
  gsmNumber: string;

  @IsOptional()
  @IsEmail({}, { message: 'Geçerli bir e-posta adresi giriniz' })
  email?: string;

  @IsStrongPassword()
  password: string;

  @IsString({ message: 'Doğrulama kodu metin olmalıdır' })
  @Length(4, 4, { message: 'Doğrulama kodu 4 haneli olmalıdır' })
  otpCode: string;
}
