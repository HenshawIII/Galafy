import { Controller, Get, Param, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ConfigService } from './config.service.js';
import { GetConfigDto } from '../admin/dto/config.dto.js';

@ApiTags('config')
@Controller('config')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('bearer')
export class ConfigController {
  constructor(private readonly configService: ConfigService) {}

  @Get()
  @ApiOperation({
    summary: 'List client-visible system configuration',
    description:
      'Returns active SystemConfig rows in client-safe categories (FEES, APP, MOBILE, SYSTEM, EVENT). Requires user authentication.',
  })
  @ApiQuery({ name: 'category', required: false, example: 'FEES' })
  @ApiResponse({ status: 200, description: 'Configurations retrieved successfully' })
  async getClientConfigs(@Query(new ValidationPipe({ transform: true })) query: GetConfigDto) {
    const configs = await this.configService.getClientVisibleConfigs(query.category);
    return { configs, total: configs.length };
  }

  @Get(':key')
  @ApiOperation({ summary: 'Get client-visible configuration by key' })
  @ApiParam({ name: 'key', example: 'ADMIN_PAYOUT_FEE' })
  @ApiResponse({ status: 200, description: 'Configuration retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Configuration not found or not client-visible' })
  async getClientConfigByKey(@Param('key') key: string) {
    return this.configService.getClientVisibleConfigByKey(key);
  }
}
