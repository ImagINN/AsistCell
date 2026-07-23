import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MinLength, MaxLength } from 'class-validator';
import { TicketChannel } from '../../common/enums';

export class CreateTicketDto {
  @ApiProperty({ minLength: 5, maxLength: 100, example: 'Faturam bu ay iki katı geldi' })
  @IsString()
  @MinLength(5)
  @MaxLength(100)
  title: string;

  @ApiProperty({ minLength: 20, example: 'Faturamda açıklama olmayan 150 TL fazla ücret var, bu kabul edilemez.' })
  @IsString()
  @MinLength(20)
  description: string;

  @ApiProperty({ enum: TicketChannel })
  @IsEnum(TicketChannel)
  channel: TicketChannel;
}
