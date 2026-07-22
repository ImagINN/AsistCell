import { IsEnum, IsOptional, IsString, ValidateIf } from 'class-validator';
import { TicketStatus } from '../../common/enums';

export class UpdateTicketStatusDto {
  @IsEnum(TicketStatus)
  status: TicketStatus;

  @ValidateIf(o => o.status === TicketStatus.COZULDU)
  @IsString()
  resolutionNote?: string;
}
