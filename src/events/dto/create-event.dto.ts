import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsDateString, IsEnum, IsNumber, Min, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
// import { EventVisibility } from '../../generated/prisma/enums.js';

export enum EventVisibility {
  PUBLIC = 'PUBLIC',
  PRIVATE = 'PRIVATE',
}

export class CreateEventDto {
  @ApiProperty({ description: 'Event title', example: 'Birthday Celebration' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty({ description: 'Event location', example: 'Lagos, Nigeria' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  location: string;

  @ApiProperty({ description: 'Event category', example: 'Birthday' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  category: string;

  @ApiPropertyOptional({ description: 'Event description', example: 'A fun birthday celebration' })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ description: 'Event cover image URL', example: 'https://example.com/image.jpg' })
  @IsString()
  @IsOptional()
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Event cover image path (local file path)', example: '/uploads/events/image.jpg' })
  @IsString()
  @IsOptional()
  imagePath?: string;

  @ApiProperty({ description: 'Go live instantly (true) or schedule for later (false)', example: false })
  @IsBoolean()
  @IsNotEmpty()
  goLiveInstantly: boolean;

  @ApiPropertyOptional({ description: 'Optional spray goal amount', example: 100000.00 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  sprayGoal?: number;

  @ApiPropertyOptional({ description: 'Optional minimum spray amount', example: 100.00 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  minSprayAmount?: number;

  @ApiProperty({ description: 'Event start date and time (ISO 8601)', example: '2025-12-25T18:00:00Z' })
  @IsDateString()
  @IsNotEmpty()
  startAt: string;

  @ApiPropertyOptional({ 
    description: 'Enable leaderboard for this event', 
    example: true,
    default: true 
  })
  @IsBoolean()
  @IsOptional()
  enableLeaderboard?: boolean;

  @ApiPropertyOptional({ 
    description: 'Allow anonymous sprayers', 
    example: false,
    default: false 
  })
  @IsBoolean()
  @IsOptional()
  anonSprayersAllowed?: boolean;

  @ApiPropertyOptional({ 
    description: 'Tagged performer (email or username)', 
    example: 'performer@example.com' 
  })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  taggedPerformer?: string;

  @ApiPropertyOptional({ 
    description: 'Event visibility', 
    enum: EventVisibility, 
    default: EventVisibility.PUBLIC,
    example: EventVisibility.PUBLIC 
  })
  @IsEnum(EventVisibility)
  @IsOptional()
  visibility?: EventVisibility;
}

