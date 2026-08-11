// Force dynamic — evita que Next.js cachee esta ruta en build-time.
export const dynamic = "force-dynamic";

import '@/server/app.module';
import { inject } from '@/server/core/container';
import { ReportsController } from '@/server/modules/reports/reports.module';

export async function GET(req: Request) {
  return inject(ReportsController).memoriaLabores(req);
}
