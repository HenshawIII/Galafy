import { Controller } from '@nestjs/common';
import { ProviderService } from './provider.service.js';

@Controller('provider')
export class ProviderController {
  constructor(private readonly providerService: ProviderService) {}
}
