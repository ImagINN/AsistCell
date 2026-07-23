import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { TicketStatus, TicketPriority } from '../../common/enums';

export class ListTicketsQueryDto {
  @ApiPropertyOptional({ description: 'TEMSILCI rolü için sunucu tarafında zorla kendi ID\'sine eşitlenir' })
  @IsOptional()
  @IsString()
  assignedAgentId?: string;

  @ApiPropertyOptional({ enum: TicketStatus, description: 'Verilmezse KAPANDI/IPTAL hariç tüm aktif talepler döner' })
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @ApiPropertyOptional({ enum: TicketPriority })
  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @ApiPropertyOptional({ enum: ['FATURA', 'SEBEKE', 'CIHAZ', 'TARIFE', 'IPTAL', 'BELIRSIZ'] })
  @IsOptional()
  @IsString()
  category?: string;
}
