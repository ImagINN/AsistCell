import { IsEmail, IsOptional, IsString, Matches } from 'class-validator';
import { GSM_REGEX } from '../../common/validators/gsm.util';

// Personel e-posta ile, müşteri GSM numarası ile giriş yapar.
// İkisinden en az biri zorunludur (servis katmanında kontrol edilir).
export class LoginDto {
  @IsOptional()
  @IsEmail({}, { message: 'Geçerli bir e-posta adresi giriniz' })
  email?: string;

  @IsOptional()
  @Matches(GSM_REGEX, {
    message: 'Geçerli bir GSM numarası giriniz (örn. 05XX XXX XX XX)',
  })
  gsmNumber?: string;

  @IsString({ message: 'Şifre metin olmalıdır' })
  password: string;
}
