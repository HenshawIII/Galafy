import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { Decimal } from '@prisma/client/runtime/library';
import { ConfigType } from '../../generated/prisma/enums.js';

@Injectable()
export class ConfigService {
  private readonly logger = new Logger(ConfigService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Get configuration value by key with type conversion
   * @param key - Configuration key
   * @param defaultValue - Default value if config doesn't exist
   * @returns Parsed configuration value
   */
  async getConfig<T = string>(key: string, defaultValue?: T): Promise<T> {
    const config = await this.databaseService.systemConfig.findUnique({
      where: { key },
    });

    if (!config || !config.isActive) {
      if (defaultValue !== undefined) {
        this.logger.warn(`Config key "${key}" not found or inactive, using default value: ${defaultValue}`);
        return defaultValue;
      }
      throw new NotFoundException(`Configuration key "${key}" not found or inactive`);
    }

    return this.parseValue(config.value, config.type) as T;
  }

  /**
   * Get all configurations by category
   * @param category - Configuration category
   * @returns Array of configurations
   */
  async getConfigByCategory(category: string): Promise<any[]> {
    return this.databaseService.systemConfig.findMany({
      where: {
        category,
        isActive: true,
      },
      orderBy: {
        key: 'asc',
      },
    });
  }

  /**
   * Get all configurations
   * @param filters - Optional filters
   * @returns Array of configurations
   */
  async getAllConfigs(filters?: { category?: string; isActive?: boolean }): Promise<any[]> {
    const where: any = {};
    if (filters?.category) {
      where.category = filters.category;
    }
    if (filters?.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    return this.databaseService.systemConfig.findMany({
      where,
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    });
  }

  /**
   * Update configuration value
   * @param key - Configuration key
   * @param value - New value (as string)
   * @param updatedBy - Admin user ID who is updating
   * @param description - Optional description update
   * @returns Updated configuration
   */
  async updateConfig(key: string, value: string, updatedBy: string, description?: string): Promise<any> {
    const existing = await this.databaseService.systemConfig.findUnique({
      where: { key },
    });

    if (!existing) {
      throw new NotFoundException(`Configuration key "${key}" not found`);
    }

    // Validate value type
    this.validateValue(value, existing.type);

    return this.databaseService.systemConfig.update({
      where: { key },
      data: {
        value,
        updatedBy,
        ...(description !== undefined ? { description } : {}),
      },
    });
  }

  /**
   * Create new configuration
   * @param data - Configuration data
   * @param updatedBy - Admin user ID who is creating
   * @returns Created configuration
   */
  async createConfig(
    data: {
      key: string;
      category: string;
      value: string;
      type: ConfigType;
      description?: string;
    },
    updatedBy: string,
  ): Promise<any> {
    // Check if key already exists
    const existing = await this.databaseService.systemConfig.findUnique({
      where: { key: data.key },
    });

    if (existing) {
      throw new BadRequestException(`Configuration key "${data.key}" already exists`);
    }

    // Validate value type
    this.validateValue(data.value, data.type);

    return this.databaseService.systemConfig.create({
      data: {
        ...data,
        updatedBy,
      },
    });
  }

  /**
   * Delete/deactivate configuration
   * @param key - Configuration key
   * @returns Updated configuration
   */
  async deleteConfig(key: string): Promise<any> {
    const existing = await this.databaseService.systemConfig.findUnique({
      where: { key },
    });

    if (!existing) {
      throw new NotFoundException(`Configuration key "${key}" not found`);
    }

    // Soft delete by setting isActive to false
    return this.databaseService.systemConfig.update({
      where: { key },
      data: {
        isActive: false,
      },
    });
  }

  /**
   * Parse value based on type
   */
  private parseValue(value: string, type: ConfigType): any {
    switch (type) {
      case ConfigType.NUMBER:
        const num = parseInt(value, 10);
        if (isNaN(num)) {
          throw new BadRequestException(`Invalid number value: ${value}`);
        }
        return num;

      case ConfigType.DECIMAL:
        try {
          return new Decimal(value);
        } catch (error) {
          throw new BadRequestException(`Invalid decimal value: ${value}`);
        }

      case ConfigType.BOOLEAN:
        const lowerValue = value.toLowerCase();
        if (lowerValue === 'true' || lowerValue === '1' || lowerValue === 'yes') {
          return true;
        }
        if (lowerValue === 'false' || lowerValue === '0' || lowerValue === 'no') {
          return false;
        }
        throw new BadRequestException(`Invalid boolean value: ${value}`);

      case ConfigType.JSON:
        try {
          return JSON.parse(value);
        } catch (error) {
          throw new BadRequestException(`Invalid JSON value: ${value}`);
        }

      case ConfigType.STRING:
      default:
        return value;
    }
  }

  /**
   * Validate value matches type
   */
  private validateValue(value: string, type: ConfigType): void {
    switch (type) {
      case ConfigType.NUMBER:
        const num = parseInt(value, 10);
        if (isNaN(num)) {
          throw new BadRequestException(`Value "${value}" is not a valid number`);
        }
        break;

      case ConfigType.DECIMAL:
        try {
          new Decimal(value);
        } catch (error) {
          throw new BadRequestException(`Value "${value}" is not a valid decimal`);
        }
        break;

      case ConfigType.BOOLEAN:
        const lowerValue = value.toLowerCase();
        if (!['true', 'false', '1', '0', 'yes', 'no'].includes(lowerValue)) {
          throw new BadRequestException(`Value "${value}" is not a valid boolean`);
        }
        break;

      case ConfigType.JSON:
        try {
          JSON.parse(value);
        } catch (error) {
          throw new BadRequestException(`Value "${value}" is not valid JSON`);
        }
        break;

      case ConfigType.STRING:
      default:
        // String values are always valid
        break;
    }
  }
}
