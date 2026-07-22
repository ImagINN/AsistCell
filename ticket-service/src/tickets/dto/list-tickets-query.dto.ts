import { IsEnum, IsOptional, IsString } from 'class-validator';
import { TicketStatus, TicketPriority } from '../../common/enums';

export class ListTicketsQueryDto {
  @IsOptional()
  @IsString()
  assignedAgentId?: string;

  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;
}
