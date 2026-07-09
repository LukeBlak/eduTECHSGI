import '@/server/app.module';
import { inject } from '@/server/core/container';
import { ReportsController } from '@/server/modules/reports/reports.module';

/** GET /api/reports/ods-project/[id] — genera el documento ODS para el proyecto (actividad) dado. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return inject(ReportsController).odsProject(req, id);
}
