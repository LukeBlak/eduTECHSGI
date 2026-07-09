import { provide } from '@/server/core/container';
import { SocialHoursService } from './social-hours.service';
import { SocialHoursController } from './social-hours.controller';

provide(SocialHoursService, () => new SocialHoursService());
provide(SocialHoursController, () => new SocialHoursController());

export { SocialHoursService, SocialHoursController };
