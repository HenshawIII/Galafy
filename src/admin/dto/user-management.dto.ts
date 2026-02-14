import { IsOptional, IsString, IsEnum, IsBoolean, IsInt, Min , IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { KycTier } from '../../users/dto/create-user-dto.js';

export class GetUsersDto {
  @ApiProperty({ required: false, example: 1, description: 'Page number' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, example: 20, description: 'Items per page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiProperty({ required: false, example: 'john@example.com', description: 'Search by email or name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false, enum: KycTier, description: 'Filter by KYC tier' })
  @IsOptional()
  @IsEnum(KycTier)
  tier?: KycTier;

  @ApiProperty({ required: false, example: true, description: 'Filter by AML restriction status' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isAmlRestricted?: boolean;
}

export class RestrictUserDto {
  @ApiProperty({ example: 'Suspicious transaction activity detected', description: 'Reason for restriction' })
  @IsString()
  reason: string;
}

export class SearchUsersDto {
  @ApiProperty({
    example: 'john@example.com',
    description: 'Search query - can be email, phone, or username. Email and phone use exact match, username uses partial match.',
  })
  @IsString({ message: 'Search query must be a string' })
  @IsNotEmpty({ message: 'Search query is required' })
  q: string;
}

