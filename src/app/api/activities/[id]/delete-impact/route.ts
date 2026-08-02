import { NextRequest } from 'next/server';
import '@/server/app.module';
import { inject } from '@/server/core/container';
import { ActivitiesController } from '@/server/modules/activities/activities.module';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/activities/[id]/delete-impact
 * Previsualiza el impacto de eliminar la actividad: lista las horas
 * sociales (con voluntario) que se borrarían automáticamente.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  return inject(ActivitiesController).deleteImpact(req, ctx);
}
