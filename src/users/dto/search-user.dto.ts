import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class SearchUserDto {
  @ApiProperty({ 
    example: 'john', 
    description: 'Search query for username (case-insensitive partial match)',
    required: false 
  })
  @IsOptional()
  @IsString({ message: 'Query must be a string' })
  query?: string;

  @ApiPropertyOptional({ 
    example: 1, 
    description: 'Page number (default: 1)',
    minimum: 1,
    default: 1 
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be at least 1' })
  page?: number = 1;

  @ApiPropertyOptional({ 
    example: 20, 
    description: 'Number of items per page (default: 20, max: 100)',
    minimum: 1,
    maximum: 100,
    default: 20 
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page size must be an integer' })
  @Min(1, { message: 'Page size must be at least 1' })
  @Max(100, { message: 'Page size must not exceed 100' })
  pageSize?: number = 20;
}
