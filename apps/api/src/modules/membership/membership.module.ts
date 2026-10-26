import { ApplicationSubmissionService } from './registration/application-submission.service';
import { Module } from '@nestjs/common';
import { MembershipController } from './membership.controller';
import { MembershipService } from './membership.service';

@Module({
  controllers: [MembershipController],
  providers: [MembershipService, ApplicationSubmissionService],
  exports: [MembershipService],
})
export class MembershipModule {}
