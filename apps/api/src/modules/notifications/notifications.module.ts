import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

// @Global() makes NotificationsService available to all modules
// without needing to import NotificationsModule everywhere.
// Any module that needs to send an email just injects NotificationsService.
@Global()
@Module({
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
