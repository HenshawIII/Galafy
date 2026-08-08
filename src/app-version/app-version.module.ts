import { Module } from '@nestjs/common';
import { AppVersionController } from './app-version.controller.js';
import { AppVersionService } from './app-version.service.js';

@Module({
  controllers: [AppVersionController],
  providers: [AppVersionService],
})
export class AppVersionModule {}
