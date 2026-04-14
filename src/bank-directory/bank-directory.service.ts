import { Injectable } from '@nestjs/common';
import { ProviderService } from '../provider/provider.service.js';

@Injectable()
export class BankDirectoryService {
  constructor(private readonly providerService: ProviderService) {}

  getBanks() {
    return this.providerService.getBanks();
  }

  bankAccountNameEnquiry(bankCode: string, accountNumber: string) {
    return this.providerService.bankAccountNameEnquiry(bankCode, accountNumber);
  }
}
