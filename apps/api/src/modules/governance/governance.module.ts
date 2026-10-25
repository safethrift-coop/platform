import { Module } from '@nestjs/common';
import { AdminGroupsController } from './admin-groups.controller';
import { GovernanceController } from './governance.controller';
import { GovernanceService } from './governance.service';

@Module({
  controllers: [GovernanceController, AdminGroupsController],
  providers: [GovernanceService],
})
export class GovernanceModule {}
