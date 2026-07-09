import { provide } from '@/server/core/container';
import { ActivitiesService } from './activities.service';
import { ActivitiesController } from './activities.controller';

provide(ActivitiesService, () => new ActivitiesService());
provide(ActivitiesController, () => new ActivitiesController());

export { ActivitiesService, ActivitiesController };
