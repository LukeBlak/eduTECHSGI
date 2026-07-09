import { provide } from '@/server/core/container';
import { HourRequestsService } from './hour-requests.service';
import { HourRequestsController } from './hour-requests.controller';

provide(HourRequestsService, () => new HourRequestsService());
provide(HourRequestsController, () => new HourRequestsController());

export { HourRequestsService, HourRequestsController };
