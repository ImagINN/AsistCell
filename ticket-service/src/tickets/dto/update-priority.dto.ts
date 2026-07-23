import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { TicketPriority } from '../../common/enums';

export class UpdatePriorityDto {
  @ApiProperty({ enum: TicketPriority, description: 'Yalnızca süpervizör değiştirebilir; AI analizini geçersiz kılar' })
  @IsEnum(TicketPriority, {
    message: 'Öncelik DUSUK, ORTA, YUKSEK veya KRITIK olmalıdır',
  })
  priority: TicketPriority;
}
