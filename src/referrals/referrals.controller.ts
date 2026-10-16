import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Request,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Public } from '../auth/public.decorator.js';
import { ReferralsService } from './referrals.service.js';
import { ApplyReferralDto, ValidateReferralQueryDto } from './dto/referral.dto.js';

@ApiTags('referrals')
@Controller('users/referral')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token.' })
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  @Get('validate')
  @Public()
  @ApiOperation({ summary: 'Validate a referral code (public, for signup UX)' })
  @ApiQuery({ name: 'code', required: true, example: 'A1B2C3D4' })
  @ApiResponse({ status: 200, description: 'Validation result' })
  async validate(@Query(new ValidationPipe({ transform: true })) query: ValidateReferralQueryDto) {
    return this.referralsService.validateCode(query.code);
  }

  @Get()
  @ApiOperation({
    summary: 'Get my referral code, who referred me, and users who used my code',
  })
  @ApiResponse({ status: 200, description: 'Referral summary (generates code if missing)' })
  async getMine(@Request() req: { user: { id: string } }) {
    return this.referralsService.getReferralSummary(req.user.id);
  }

  @Post('generate')
  @ApiOperation({
    summary: 'Ensure I have a referral code (idempotent; for legacy users)',
  })
  @ApiResponse({ status: 200, description: 'Referral code' })
  async generate(@Request() req: { user: { id: string } }) {
    const referralCode = await this.referralsService.ensureUserReferralCode(req.user.id);
    return { referralCode };
  }

  @Post('apply')
  @ApiOperation({
    summary: 'Apply a referral code (Google/Apple / late attribution; once only)',
  })
  @ApiResponse({ status: 200, description: 'Referral attributed' })
  @ApiResponse({ status: 400, description: 'Invalid, self-referral, or already attributed' })
  async apply(
    @Request() req: { user: { id: string } },
    @Body(new ValidationPipe({ transform: true })) dto: ApplyReferralDto,
  ) {
    const result = await this.referralsService.attributeReferral(
      req.user.id,
      dto.referralCode,
    );
    return {
      message: 'Referral attributed successfully',
      referrerId: result.referrerId,
      codeUsed: result.codeUsed,
      attributedAt: result.createdAt.toISOString(),
    };
  }
}
