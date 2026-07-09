import '@/server/app.module';
import { inject } from '@/server/core/container';
import { DashboardController } from '@/server/modules/dashboard/dashboard.module';

export async function GET() {
  return inject(DashboardController).stats();
}
