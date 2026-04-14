import { IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserSettingsDto {
  @ApiProperty({
    example: false,
    description: 'When enabled, others can see your spray activity on the leaderboard',
    default: false,
  })
  @IsBoolean({ message: 'showOnLeaderboard must be a boolean' })
  showOnLeaderboard: boolean;

  @ApiProperty({
    example: true,
    description: 'Let others tag you in event sprays or comments',
    default: true,
  })
  @IsBoolean({ message: 'allowMentionsOrTags must be a boolean' })
  allowMentionsOrTags: boolean;

  @ApiProperty({
    example: false,
    description: 'Display when you are active in events',
    default: false,
  })
  @IsBoolean({ message: 'showOnlineStatus must be a boolean' })
  showOnlineStatus: boolean;

  @ApiProperty({
    example: true,
    description: "Let others know you're ready to be celebrated at events",
    default: true,
  })
  @IsBoolean({ message: 'visibleAtEvents must be a boolean' })
  visibleAtEvents: boolean;

  @ApiProperty({
    example: true,
    description: 'Enable push notifications',
    default: true,
  })
  @IsBoolean({ message: 'pushNotifications must be a boolean' })
  pushNotifications: boolean;

  @ApiProperty({
    example: true,
    description: 'Receive event reminders',
    default: true,
  })
  @IsBoolean({ message: 'eventReminders must be a boolean' })
  eventReminders: boolean;

  @ApiProperty({
    example: false,
    description: 'Receive leaderboard updates',
    default: false,
  })
  @IsBoolean({ message: 'leaderboardUpdates must be a boolean' })
  leaderboardUpdates: boolean;

  @ApiProperty({
    example: false,
    description: 'Receive alerts when someone follows you',
    default: false,
  })
  @IsBoolean({ message: 'newFollowerAlerts must be a boolean' })
  newFollowerAlerts: boolean;
}

export class UpdateUserSettingsDto {
  @ApiPropertyOptional({
    example: false,
    description: 'When enabled, others can see your spray activity on the leaderboard',
  })
  @IsOptional()
  @IsBoolean({ message: 'showOnLeaderboard must be a boolean' })
  showOnLeaderboard?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Let others tag you in event sprays or comments',
  })
  @IsOptional()
  @IsBoolean({ message: 'allowMentionsOrTags must be a boolean' })
  allowMentionsOrTags?: boolean;

  @ApiPropertyOptional({
    example: false,
    description: 'Display when you are active in events',
  })
  @IsOptional()
  @IsBoolean({ message: 'showOnlineStatus must be a boolean' })
  showOnlineStatus?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: "Let others know you're ready to be celebrated at events",
  })
  @IsOptional()
  @IsBoolean({ message: 'visibleAtEvents must be a boolean' })
  visibleAtEvents?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Enable push notifications',
  })
  @IsOptional()
  @IsBoolean({ message: 'pushNotifications must be a boolean' })
  pushNotifications?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Receive event reminders',
  })
  @IsOptional()
  @IsBoolean({ message: 'eventReminders must be a boolean' })
  eventReminders?: boolean;

  @ApiPropertyOptional({
    example: false,
    description: 'Receive leaderboard updates',
  })
  @IsOptional()
  @IsBoolean({ message: 'leaderboardUpdates must be a boolean' })
  leaderboardUpdates?: boolean;

  @ApiPropertyOptional({
    example: false,
    description: 'Receive alerts when someone follows you',
  })
  @IsOptional()
  @IsBoolean({ message: 'newFollowerAlerts must be a boolean' })
  newFollowerAlerts?: boolean;
}
