import { IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class JoinEventDto {
  @ApiPropertyOptional({ description: 'Wallet ID to use for this event (optional)' })
  @IsOptional()
  walletId?: string;
}
