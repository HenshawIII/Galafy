import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdatePublicLeaderboardDto {
  @ApiProperty({ description: 'Enable or disable the public shareable leaderboard' })
  @IsBoolean()
  enabled: boolean;

  @ApiPropertyOptional({
    description: 'When true, spray amounts are visible. When false, ranking only.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  showAmounts?: boolean;
}
