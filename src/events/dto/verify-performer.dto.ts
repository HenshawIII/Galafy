import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyPerformerDto {
  @ApiProperty({ 
    description: 'Performer identifier (email or username)', 
    example: 'performer@example.com' 
  })
  @IsString({ message: 'Performer identifier must be a string' })
  @IsNotEmpty({ message: 'Performer identifier is required' })
  @MaxLength(255, { message: 'Performer identifier must not exceed 255 characters' })
  identifier: string;
}

