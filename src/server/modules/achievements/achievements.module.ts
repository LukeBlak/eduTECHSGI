import { provide } from '@/server/core/container';
import { AchievementsService } from './achievements.service';
import { AchievementsController } from './achievements.controller';

provide(AchievementsService, () => new AchievementsService());
provide(AchievementsController, () => new AchievementsController());

export { AchievementsService, AchievementsController };
