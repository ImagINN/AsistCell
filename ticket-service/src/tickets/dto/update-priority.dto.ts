import { IsEnum } from 'class-validator';
import { TicketPriority } from '../../common/enums';

export class UpdatePriorityDto {
  @IsEnum(TicketPriority, {
    message: 'Öncelik DUSUK, ORTA, YUKSEK veya KRITIK olmalıdır',
  })
  priority: TicketPriority;
}
