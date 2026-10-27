import { AccountReadsService } from './account-reads.service';
import { Module } from '@nestjs/common';
import { SavingsController } from './savings.controller';
import { SavingsService } from './savings.service';

@Module({
  controllers: [SavingsController],
  providers: [SavingsService, AccountReadsService],
  exports: [SavingsService],
})
export class SavingsModule {}
