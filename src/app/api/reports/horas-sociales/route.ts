import '@/server/app.module';
import { inject } from '@/server/core/container';
import { ReportsController } from '@/server/modules/reports/reports.module';

export async function GET(req: Request) {
  return inject(ReportsController).horasSociales(req);
}
