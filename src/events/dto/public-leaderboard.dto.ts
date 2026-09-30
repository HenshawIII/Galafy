import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min, ValidateIf } from 'class-validator';

export class UpdatePublicLeaderboardDto {
  @ApiProperty({
    description:
      'Enable or disable (revoke) the public shareable leaderboard. Disabling clears the token so the old share URL never works again.',
  })
  @IsBoolean()
  enabled: boolean;

  @ApiPropertyOptional({
    description: 'When true, per-sprayer amounts are visible on the public board.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  showAmounts?: boolean;

  @ApiPropertyOptional({
    description: 'When true, sprayer display names are visible. When false, names are replaced with generic labels.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  showNames?: boolean;

  @ApiPropertyOptional({
    description: 'When true, aggregate total sprayed is visible in public stats.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  showTotalAmount?: boolean;

  @ApiPropertyOptional({
    description: 'When true, giver/participant count is visible in public stats.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  showParticipantCount?: boolean;

  @ApiPropertyOptional({
    description:
      'When true, users who opted out of event visibility appear as Anonymous. When false, those users are omitted from the public board.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  allowAnonymous?: boolean;

  @ApiPropertyOptional({
    description: 'Limit public leaderboard to top N ranks. Omit or null for full list. Max 100.',
    nullable: true,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  topN?: number | null;

  @ApiPropertyOptional({
    description:
      'When true while enabling, issue a new token and invalidate the previous share URL. Ignored when enabled=false.',
  })
  @IsOptional()
  @IsBoolean()
  regenerate?: boolean;
}
