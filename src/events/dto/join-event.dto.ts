import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { EventRole } from './event-enums.js';

export class JoinEventDto {
  @ApiPropertyOptional({
    description:
      'Role in the event. Defaults to ATTENDEE. Only the event host can be CELEBRANT, and only the tagged performer can be PERFORMER. Regular participants are always ATTENDEEs.',
    enum: EventRole,
    example: EventRole.ATTENDEE,
    default: EventRole.ATTENDEE,
  })
  @IsEnum(EventRole)
  @IsOptional()
  role?: EventRole;

  @ApiPropertyOptional({ description: 'Wallet ID to use for this event (optional)' })
  @IsOptional()
  walletId?: string;
}
