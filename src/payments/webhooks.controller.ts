import {
  Controller,
  Post,
  Body,
  Headers,
  Req,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { WebhooksService } from './webhooks.service.js';
import { InflowWebhookDto, PayoutWebhookDto } from './dto/webhook.dto.js';
import { Public } from '../auth/public.decorator.js';
import type { Request } from 'express';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('provider')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Provider webhook endpoint for INFLOW and PAYOUT events' })
  @ApiHeader({ name: 'x-embedly-signature', description: 'SHA512 signature of the payload', required: true })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid signature' })
  @ApiResponse({ status: 400, description: 'Invalid webhook data' })
  async handleProviderWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-embedly-signature') signature: string,
    @Body() body: InflowWebhookDto | PayoutWebhookDto,
  ) {
    // Get raw body for signature verification
    // rawBody is a Buffer when rawBody: true is set in NestFactory.create
    const rawBody = req.rawBody 
      ? (Buffer.isBuffer(req.rawBody) ? req.rawBody.toString('utf8') : String(req.rawBody))
      : JSON.stringify(body);

    // Verify signature
    if (!this.webhooksService.verifySignature(signature, rawBody)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    // Route to appropriate handler based on event type
    if (body.event === 'nip') {
      return this.webhooksService.handleInflowWebhook(body as InflowWebhookDto);
    } else if (body.event === 'payout') {
      return this.webhooksService.handlePayoutWebhook(body as PayoutWebhookDto);
    } else {
      throw new BadRequestException(`Unknown webhook event type: ${body.event}`);
    }
  }
}

