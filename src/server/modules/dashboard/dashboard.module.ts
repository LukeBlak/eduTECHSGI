import { provide } from '@/server/core/container';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

provide(DashboardService, () => new DashboardService());
provide(DashboardController, () => new DashboardController());

export { DashboardService, DashboardController };
