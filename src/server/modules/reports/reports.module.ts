import { provide } from '@/server/core/container';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';

provide(ReportsService, () => new ReportsService());
provide(ReportsController, () => new ReportsController());

export { ReportsService, ReportsController };
