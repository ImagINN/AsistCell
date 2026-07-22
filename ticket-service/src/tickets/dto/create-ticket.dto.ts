import { IsEnum, IsString, MinLength, MaxLength } from 'class-validator';
import { TicketChannel } from '../../common/enums';

export class CreateTicketDto {
  @IsString()
  @MinLength(5)
  @MaxLength(100)
  title: string;

  @IsString()
  @MinLength(20)
  description: string;

  @IsEnum(TicketChannel)
  channel: TicketChannel;
}
