import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { ConfigService } from '../config/config.service.js';
import { GetConfigDto, UpdateConfigDto, CreateConfigDto } from './dto/config.dto.js';
import { AdminRole } from '../../generated/prisma/enums.js';

@Injectable()
export class AdminService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Check if user is an admin with write permissions
   */
  private async checkAdminPermissions(userId: string): Promise<void> {
    const admin = await this.databaseService.admin.findFirst({
      where: {
        userId,
        isActive: true,
      },
      select: {
        role: true,
      },
    });

    if (!admin) {
      throw new ForbiddenException('You do not have admin permissions');
    }

    // Only SUPER_ADMIN, OPERATIONS, and COMPLIANCE can modify configs
    if (
      admin.role !== AdminRole.SUPER_ADMIN &&
      admin.role !== AdminRole.OPERATIONS &&
      admin.role !== AdminRole.COMPLIANCE
    ) {
      throw new ForbiddenException('You do not have permission to modify configurations');
    }
  }

  /**
   * Get all configurations with optional filtering
   */
  async getConfigs(filters?: GetConfigDto) {
    const configs = await this.configService.getAllConfigs({
      category: filters?.category,
      isActive: filters?.isActive,
    });

    return {
      configs,
      total: configs.length,
    };
  }

  /**
   * Get configuration by key
   */
  async getConfigByKey(key: string) {
    try {
      const config = await this.configService.getConfig(key);
      // Get full config record for response
      const configRecord = await this.databaseService.systemConfig.findUnique({
        where: { key },
      });

      if (!configRecord) {
        throw new NotFoundException(`Configuration key "${key}" not found`);
      }

      return configRecord;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new NotFoundException(`Configuration key "${key}" not found`);
    }
  }

  /**
   * Get configurations by category
   */
  async getConfigsByCategory(category: string) {
    return this.configService.getConfigByCategory(category);
  }

  /**
   * Update configuration
   */
  async updateConfig(key: string, data: UpdateConfigDto, userId: string) {
    await this.checkAdminPermissions(userId);
    return this.configService.updateConfig(key, data.value, userId, data.description);
  }

  /**
   * Create new configuration
   */
  async createConfig(data: CreateConfigDto, userId: string) {
    await this.checkAdminPermissions(userId);
    return this.configService.createConfig(data, userId);
  }

  /**
   * Delete/deactivate configuration
   */
  async deleteConfig(key: string, userId: string) {
    await this.checkAdminPermissions(userId);
    return this.configService.deleteConfig(key);
  }
}
