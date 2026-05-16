import { Global, Module } from '@nestjs/common';
import { BvnCryptoService } from './bvn-crypto.service.js';

@Global()
@Module({
  providers: [BvnCryptoService],
  exports: [BvnCryptoService],
})
export class BvnCryptoModule {}
