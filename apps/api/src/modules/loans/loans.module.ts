import { Module } from '@nestjs/common';
import { LoansController } from './loans.controller';
import { LoanReadsService } from './loan-reads.service';
import { LoansService } from './loans.service';

@Module({
  controllers: [LoansController],
  providers: [LoansService, LoanReadsService],
  exports: [LoansService],
})
export class LoansModule {}
