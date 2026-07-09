import { provide } from '@/server/core/container';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';

provide(NotificationsService, () => new NotificationsService());
provide(NotificationsController, () => new NotificationsController());

export { NotificationsService, NotificationsController };
