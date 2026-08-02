import { NextRequest } from 'next/server';
import '@/server/app.module';
import { inject } from '@/server/core/container';
import { ClassesController } from '@/server/modules/classes/classes.module';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/classes/[id]/delete-impact
 * Previsualiza el impacto de eliminar la clase: lista las horas
 * sociales (con voluntario) que se borrarían automáticamente.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  return inject(ClassesController).deleteImpact(req, ctx);
}
