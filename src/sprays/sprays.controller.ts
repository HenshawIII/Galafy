import {
  Controller,
  Post,
  Body,
  Param,
  Request,
  UseGuards,
  Headers,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiHeader,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { SpraysService } from './sprays.service.js';
import { CreateSprayDto } from './dto/create-spray.dto.js';
import { SprayRateLimitGuard } from './guards/spray-rate-limit.guard.js';

@ApiTags('sprays')
@Controller('events/:eventId/sprays')
@UseGuards(JwtAuthGuard, SprayRateLimitGuard)
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
export class SpraysController {
  constructor(private readonly spraysService: SpraysService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a spray (tip) in an event',
    description:
      'Creates a spray transaction within a LIVE event. Requires Idempotency-Key header to prevent duplicate charges.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'UUID for idempotency. Required to prevent duplicate charges.',
    required: true,
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 201,
    description: 'Spray created successfully',
    schema: {
      type: 'object',
      properties: {
        spray: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            eventId: { type: 'string' },
            sprayerWalletId: { type: 'string' },
            receiverWalletId: { type: 'string' },
            totalAmount: { type: 'string' },
            note: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        sprayerBalance: { type: 'string', description: 'Updated sprayer wallet balance' },
        receiverBalance: { type: 'string', description: 'Updated receiver wallet balance' },
        eventTotals: {
          type: 'object',
          properties: {
            totalAmount: { type: 'string' },
            totalCount: { type: 'number' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid amount, insufficient balance, or missing required fields',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Event not LIVE or user not a participant',
  })
  @ApiResponse({
    status: 404,
    description: 'Not found - Event, participant, or wallet not found',
  })
  async createSpray(
    @Param('eventId') eventId: string,
    @Request() req: any,
    @Body(ValidationPipe) createSprayDto: CreateSprayDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('User ID is required. Please ensure you are authenticated.');
    }

    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    return this.spraysService.createSpray(eventId, userId, createSprayDto, idempotencyKey);
  }
}

