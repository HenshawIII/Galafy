import { PartialType } from '@nestjs/mapped-types';
import { CreateEventDto } from './create-event.dto.js';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum } from 'class-validator';
// import { EventStatus } from '../../generated/prisma/enums.js';
export enum EventStatus {
  DRAFT = 'DRAFT',
  SCHEDULED = 'SCHEDULED',
  LIVE = 'LIVE',
  ENDED = 'ENDED',
  CANCELLED = 'CANCELLED',
}

export class UpdateEventDto extends PartialType(CreateEventDto) {
  @ApiPropertyOptional({ 
    description: 'Event status', 
    enum: EventStatus,
    example: EventStatus.LIVE 
  })
  @IsEnum(EventStatus)
  @IsOptional()
  status?: EventStatus;
}

