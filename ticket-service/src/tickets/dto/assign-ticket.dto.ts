import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class AssignTicketDto {
  @ApiProperty({ description: 'Atanacak temsilcinin (identity-service) kullanıcı ID\'si' })
  @IsString()
  @MinLength(1)
  agentId: string;
}
