import { Matches } from 'class-validator';
import { GSM_REGEX } from '../../common/validators/gsm.util';

export class RequestOtpDto {
  @Matches(GSM_REGEX, {
    message: 'Geçerli bir GSM numarası giriniz (örn. 5XX XXX XX XX)',
  })
  gsmNumber: string;
}
