import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { AdminService } from './admin.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { GetConfigDto, UpdateConfigDto, CreateConfigDto } from './dto/config.dto.js';

@ApiTags('admin')
@Controller('admin')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /**
   * Get all configurations
   */
  @Get('config')
  @ApiOperation({
    summary: 'Get all configurations',
    description: 'Retrieves all system configurations with optional filtering by category and active status. Read access available to all authenticated users.',
  })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by category (e.g., FEES, RISK, DEVICE_ABUSE)', example: 'FEES' })
  @ApiQuery({ name: 'isActive', required: false, description: 'Filter by active status', example: true, type: Boolean })
  @ApiResponse({
    status: 200,
    description: 'Configurations retrieved successfully',
    schema: {
      example: {
        configs: [
          {
            id: 'uuid',
            key: 'ADMIN_PAYOUT_FEE',
            category: 'FEES',
            value: '0.03',
            type: 'DECIMAL',
            description: 'Admin fee for payouts (3%)',
            isActive: true,
            updatedBy: 'admin-user-id',
            updatedAt: '2025-01-19T20:00:00.000Z',
            createdAt: '2025-01-19T20:00:00.000Z',
          },
        ],
        total: 1,
      },
    },
  })
  async getConfigs(@Query(ValidationPipe) filters: GetConfigDto) {
    return this.adminService.getConfigs(filters);
  }

  /**
   * Get configuration by key
   */
  @Get('config/:key')
  @ApiOperation({
    summary: 'Get configuration by key',
    description: 'Retrieves a specific configuration by its key. Read access available to all authenticated users.',
  })
  @ApiParam({ name: 'key', description: 'Configuration key', example: 'ADMIN_PAYOUT_FEE' })
  @ApiResponse({
    status: 200,
    description: 'Configuration retrieved successfully',
    schema: {
      example: {
        id: 'uuid',
        key: 'ADMIN_PAYOUT_FEE',
        category: 'FEES',
        value: '0.03',
        type: 'DECIMAL',
        description: 'Admin fee for payouts (3%)',
        isActive: true,
        updatedBy: 'admin-user-id',
        updatedAt: '2025-01-19T20:00:00.000Z',
        createdAt: '2025-01-19T20:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Configuration not found' })
  async getConfigByKey(@Param('key') key: string) {
    return this.adminService.getConfigByKey(key);
  }

  /**
   * Get configurations by category
   */
  @Get('config/category/:category')
  @ApiOperation({
    summary: 'Get configurations by category',
    description: 'Retrieves all configurations in a specific category. Read access available to all authenticated users.',
  })
  @ApiParam({ name: 'category', description: 'Configuration category', example: 'FEES' })
  @ApiResponse({
    status: 200,
    description: 'Configurations retrieved successfully',
    schema: {
      example: [
        {
          id: 'uuid',
          key: 'ADMIN_PAYOUT_FEE',
          category: 'FEES',
          value: '0.03',
          type: 'DECIMAL',
          description: 'Admin fee for payouts (3%)',
          isActive: true,
        },
      ],
    },
  })
  async getConfigsByCategory(@Param('category') category: string) {
    return this.adminService.getConfigsByCategory(category);
  }

  /**
   * Update configuration
   */
  @Put('config/:key')
  @ApiOperation({
    summary: 'Update configuration',
    description: 'Updates a configuration value. Only admins (SUPER_ADMIN, OPERATIONS, COMPLIANCE) can update configurations.',
  })
  @ApiParam({ name: 'key', description: 'Configuration key', example: 'ADMIN_PAYOUT_FEE' })
  @ApiBody({ type: UpdateConfigDto })
  @ApiResponse({
    status: 200,
    description: 'Configuration updated successfully',
    schema: {
      example: {
        id: 'uuid',
        key: 'ADMIN_PAYOUT_FEE',
        category: 'FEES',
        value: '0.05',
        type: 'DECIMAL',
        description: 'Updated payout fee',
        isActive: true,
        updatedBy: 'admin-user-id',
        updatedAt: '2025-01-19T20:05:00.000Z',
        createdAt: '2025-01-19T20:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Configuration not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid value type' })
  async updateConfig(
    @Param('key') key: string,
    @Body(ValidationPipe) data: UpdateConfigDto,
    @Request() req: any,
  ) {
    const userId = req.user?.id;
    return this.adminService.updateConfig(key, data, userId);
  }

  /**
   * Create new configuration
   */
  @Post('config')
  @ApiOperation({
    summary: 'Create new configuration',
    description: 'Creates a new configuration entry. Only admins (SUPER_ADMIN, OPERATIONS, COMPLIANCE) can create configurations.',
  })
  @ApiBody({ type: CreateConfigDto })
  @ApiResponse({
    status: 201,
    description: 'Configuration created successfully',
    schema: {
      example: {
        id: 'uuid',
        key: 'NEW_CONFIG_KEY',
        category: 'FEES',
        value: '0.02',
        type: 'DECIMAL',
        description: 'New configuration',
        isActive: true,
        updatedBy: 'admin-user-id',
        updatedAt: '2025-01-19T20:00:00.000Z',
        createdAt: '2025-01-19T20:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - Key already exists or invalid data' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  async createConfig(
    @Body(ValidationPipe) data: CreateConfigDto,
    @Request() req: any,
  ) {
    const userId = req.user?.id;
    return this.adminService.createConfig(data, userId);
  }

  /**
   * Delete/deactivate configuration
   */
  @Delete('config/:key')
  @ApiOperation({
    summary: 'Delete configuration',
    description: 'Soft deletes (deactivates) a configuration by setting isActive to false. Only admins (SUPER_ADMIN, OPERATIONS, COMPLIANCE) can delete configurations.',
  })
  @ApiParam({ name: 'key', description: 'Configuration key', example: 'ADMIN_PAYOUT_FEE' })
  @ApiResponse({
    status: 200,
    description: 'Configuration deactivated successfully',
    schema: {
      example: {
        id: 'uuid',
        key: 'ADMIN_PAYOUT_FEE',
        category: 'FEES',
        value: '0.03',
        type: 'DECIMAL',
        description: 'Admin fee for payouts (3%)',
        isActive: false,
        updatedBy: 'admin-user-id',
        updatedAt: '2025-01-19T20:10:00.000Z',
        createdAt: '2025-01-19T20:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Configuration not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  async deleteConfig(
    @Param('key') key: string,
    @Request() req: any,
  ) {
    const userId = req.user?.id;
    return this.adminService.deleteConfig(key, userId);
  }
}
