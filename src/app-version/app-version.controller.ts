import { Controller, Get, Query, ValidationPipe } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator.js';
import { AppVersionService } from './app-version.service.js';
import { IosVersionQueryDto } from './dto/ios-version-query.dto.js';

@ApiTags('app')
@Controller('app')
export class AppVersionController {
  constructor(private readonly appVersionService: AppVersionService) {}

  @Get('ios-version')
  @Public()
  @ApiOperation({
    summary: 'Check iOS app version against App Store',
    description:
      'Compares the client iOS app version with the live version from Apple iTunes lookup. Public endpoint.',
  })
  @ApiQuery({
    name: 'version',
    required: true,
    example: '1.0.5',
    description: 'Current iOS app version on the client',
  })
  @ApiResponse({
    status: 200,
    description: 'Version comparison result',
    schema: {
      example: {
        clientVersion: '1.0.5',
        latestVersion: '1.0.6',
        updateAvailable: true,
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Missing or invalid version query param' })
  @ApiResponse({ status: 502, description: 'Unable to fetch App Store version' })
  checkIosVersion(@Query(ValidationPipe) query: IosVersionQueryDto) {
    return this.appVersionService.checkIosVersion(query.version.trim());
  }
}
