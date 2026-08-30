// Force dynamic — evita que Next.js cachee esta ruta en build-time.
export const dynamic = "force-dynamic";

import '@/server/app.module';
import { inject } from '@/server/core/container';
import { CommitteesController } from '@/server/modules/committees/committees.module';

/**
 * GET /api/committees/public
 *
 * Endpoint PÚBLICO (sin auth) que devuelve solo id/name/color de los
 * comités. Usado por el formulario de registro (LoginScreen) antes de
 * que el volunteer tenga sesión. No expone datos sensibles.
 *
 * El endpoint `/api/committees` (regular) requiere auth y devuelve
 * miembros, actividades y clases por comité — datos que no queremos
 * exponer públicamente ni necesarios para registrarse.
 */
export async function GET() {
  return inject(CommitteesController).publicList();
}
