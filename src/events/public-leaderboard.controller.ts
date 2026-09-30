import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator.js';
import { PublicLeaderboardService } from './public-leaderboard.service.js';

@ApiTags('Public Leaderboard')
@Controller('public/leaderboard')
export class PublicLeaderboardController {
  constructor(private readonly publicLeaderboardService: PublicLeaderboardService) {}

  @Public()
  @Get(':token')
  @ApiOperation({
    summary: 'Get public live leaderboard snapshot by share token',
    description:
      'No authentication required. Returns event stats, leaderboard, and recent activity. Amounts omitted when ranking-only.',
  })
  @ApiParam({ name: 'token', description: 'Opaque public leaderboard share token' })
  @ApiResponse({ status: 200, description: 'Public leaderboard snapshot' })
  @ApiResponse({ status: 404, description: 'Token invalid or sharing disabled' })
  async getByToken(@Param('token') token: string) {
    return this.publicLeaderboardService.getSnapshotByToken(token);
  }
}
