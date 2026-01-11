import { IsEnum, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EventRole } from './event-enums.js';

export class JoinEventDto {
  @ApiProperty({ 
    description: 'Role in the event. CELEBRANT and PERFORMER require Tier_2 or higher. ATTENDEE is available to all tiers.',
    enum: EventRole,
    example: EventRole.ATTENDEE 
  })
  @IsEnum(EventRole)
  role: EventRole;

  @ApiPropertyOptional({ description: 'Wallet ID to use for this event (optional)' })
  @IsOptional()
  walletId?: string;
}

