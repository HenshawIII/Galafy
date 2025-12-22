import { IsString, IsNotEmpty, IsIn, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ExportWalletHistoryDto {
  @ApiProperty({
    description: 'Export format',
    enum: ['csv', 'pdf'],
    example: 'csv',
  })
  @IsString({ message: 'Format must be a string' })
  @IsNotEmpty({ message: 'Format is required' })
  @IsIn(['csv', 'pdf'], { message: 'Format must be either "csv" or "pdf"' })
  format: 'csv' | 'pdf';

  @ApiProperty({
    description: 'Start date for the export period (YYYY-MM-DD)',
    example: '2025-01-01',
  })
  @IsString({ message: 'Start date must be a string' })
  @IsNotEmpty({ message: 'Start date is required' })
  startDate: string;

  @ApiProperty({
    description: 'End date for the export period (YYYY-MM-DD)',
    example: '2025-01-31',
  })
  @IsString({ message: 'End date must be a string' })
  @IsNotEmpty({ message: 'End date is required' })
  endDate: string;
}

