// Force dynamic — evita que Next.js cachee esta ruta en build-time.
export const dynamic = "force-dynamic";

import { NextRequest } from 'next/server';
import '@/server/app.module';
import { ok, unauthorized, forbidden, serverError } from '@/server/core/http';
import { requirePrivileged } from '@/server/core/auth.guard';
import { findAll, findById, deleteMany } from '@/lib/firestore-helpers';

/**
 * POST /api/admin/cleanup-orphans
 *
 * Borra documentos huérfanos en colecciones de join:
 *   - classVolunteers cuyo classId o volunteerId ya no existe
 *   - activityVolunteers cuyo activityId o volunteerId ya no existe
 *   - volunteerAchievements cuyo achievementId o volunteerId ya no existe
 *
 * Esto NO debería ser necesario en operación normal (los endpoints de
 * delete hacen cascade), pero Firestore no tiene foreign keys así que
 * datos legacy o borrados directos desde la consola pueden dejar links
 * sueltos que el frontend no sabe manejar.
 *
 * Requiere rol privilegiado (admin/presidente/vice/líder).
 */
export async function POST(req: NextRequest) {
  // Solo roles privilegiados pueden ejecutar limpieza destructiva.
  const auth = requirePrivileged(req);
  if (!auth.ok) {
    return auth.status === 401
      ? unauthorized(auth.body.message as string)
      : forbidden(auth.body.message as string);
  }

  try {
    // ─── classVolunteers huérfanos ───
    const classVolunteers = await findAll<{
      classId: string;
      volunteerId: string;
    }>('classVolunteers');

    const classVolunteersOrphanIds: string[] = [];
    for (const cv of classVolunteers) {
      const [cls, vol] = await Promise.all([
        cv.classId ? findById('classes', cv.classId) : Promise.resolve(null),
        cv.volunteerId ? findById('volunteers', cv.volunteerId) : Promise.resolve(null),
      ]);
      if (!cls || !vol) {
        classVolunteersOrphanIds.push(cv.id);
      }
    }

    // ─── activityVolunteers huérfanos ───
    const activityVolunteers = await findAll<{
      activityId: string;
      volunteerId: string;
    }>('activityVolunteers');

    const activityVolunteersOrphanIds: string[] = [];
    for (const av of activityVolunteers) {
      const [act, vol] = await Promise.all([
        av.activityId ? findById('activities', av.activityId) : Promise.resolve(null),
        av.volunteerId ? findById('volunteers', av.volunteerId) : Promise.resolve(null),
      ]);
      if (!act || !vol) {
        activityVolunteersOrphanIds.push(av.id);
      }
    }

    // ─── volunteerAchievements huérfanos ───
    const volunteerAchievements = await findAll<{
      achievementId: string;
      volunteerId: string;
    }>('volunteerAchievements');

    const volunteerAchievementsOrphanIds: string[] = [];
    for (const va of volunteerAchievements) {
      const [ach, vol] = await Promise.all([
        va.achievementId ? findById('achievements', va.achievementId) : Promise.resolve(null),
        va.volunteerId ? findById('volunteers', va.volunteerId) : Promise.resolve(null),
      ]);
      if (!ach || !vol) {
        volunteerAchievementsOrphanIds.push(va.id);
      }
    }

    // ─── Borrar los huérfanos ───
    // deleteMany solo soporta where por campo=valor, no por lista de IDs.
    // Borramos uno por uno con remove (batched internally por deleteMany no
    // soporta IDs arbitrarios; usamos un helper manual).
    const deleted = {
      classVolunteers: 0,
      activityVolunteers: 0,
      volunteerAchievements: 0,
    };

    // Para borrar por IDs específicos, iteramos y usamos el helper remove.
    // Import dinámico para evitar ciclos.
    const { remove } = await import('@/lib/firestore-helpers');
    await Promise.all(
      classVolunteersOrphanIds.map((id) => remove('classVolunteers', id)),
    );
    deleted.classVolunteers = classVolunteersOrphanIds.length;

    await Promise.all(
      activityVolunteersOrphanIds.map((id) => remove('activityVolunteers', id)),
    );
    deleted.activityVolunteers = activityVolunteersOrphanIds.length;

    await Promise.all(
      volunteerAchievementsOrphanIds.map((id) => remove('volunteerAchievements', id)),
    );
    deleted.volunteerAchievements = volunteerAchievementsOrphanIds.length;

    // Métricas del barrido
    const summary = {
      scanned: {
        classVolunteers: classVolunteers.length,
        activityVolunteers: activityVolunteers.length,
        volunteerAchievements: volunteerAchievements.length,
      },
      deleted,
      orphanIds: {
        classVolunteers: classVolunteersOrphanIds,
        activityVolunteers: activityVolunteersOrphanIds,
        volunteerAchievements: volunteerAchievementsOrphanIds,
      },
    };

    return ok({
      success: true,
      message: `Limpieza completada: ${deleted.classVolunteers + deleted.activityVolunteers + deleted.volunteerAchievements} documentos huérfanos eliminados.`,
      ...summary,
    });
  } catch (e) {
    return serverError('Error al limpiar huérfanos', e);
  }
}

// GET devuelve un reporte (sin borrar) — útil para auditar antes de ejecutar.
export async function GET(req: NextRequest) {
  const auth = requirePrivileged(req);
  if (!auth.ok) {
    return auth.status === 401
      ? unauthorized(auth.body.message as string)
      : forbidden(auth.body.message as string);
  }

  try {
    const classVolunteers = await findAll<{
      classId: string;
      volunteerId: string;
    }>('classVolunteers');
    const activityVolunteers = await findAll<{
      activityId: string;
      volunteerId: string;
    }>('activityVolunteers');
    const volunteerAchievements = await findAll<{
      achievementId: string;
      volunteerId: string;
    }>('volunteerAchievements');

    const classVolunteersOrphanIds: string[] = [];
    for (const cv of classVolunteers) {
      const [cls, vol] = await Promise.all([
        cv.classId ? findById('classes', cv.classId) : Promise.resolve(null),
        cv.volunteerId ? findById('volunteers', cv.volunteerId) : Promise.resolve(null),
      ]);
      if (!cls || !vol) classVolunteersOrphanIds.push(cv.id);
    }

    const activityVolunteersOrphanIds: string[] = [];
    for (const av of activityVolunteers) {
      const [act, vol] = await Promise.all([
        av.activityId ? findById('activities', av.activityId) : Promise.resolve(null),
        av.volunteerId ? findById('volunteers', av.volunteerId) : Promise.resolve(null),
      ]);
      if (!act || !vol) activityVolunteersOrphanIds.push(av.id);
    }

    const volunteerAchievementsOrphanIds: string[] = [];
    for (const va of volunteerAchievements) {
      const [ach, vol] = await Promise.all([
        va.achievementId ? findById('achievements', va.achievementId) : Promise.resolve(null),
        va.volunteerId ? findById('volunteers', va.volunteerId) : Promise.resolve(null),
      ]);
      if (!ach || !vol) volunteerAchievementsOrphanIds.push(va.id);
    }

    return ok({
      scanned: {
        classVolunteers: classVolunteers.length,
        activityVolunteers: activityVolunteers.length,
        volunteerAchievements: volunteerAchievements.length,
      },
      orphansFound: {
        classVolunteers: classVolunteersOrphanIds.length,
        activityVolunteers: activityVolunteersOrphanIds.length,
        volunteerAchievements: volunteerAchievementsOrphanIds.length,
      },
      orphanIds: {
        classVolunteers: classVolunteersOrphanIds,
        activityVolunteers: activityVolunteersOrphanIds,
        volunteerAchievements: volunteerAchievementsOrphanIds,
      },
    });
  } catch (e) {
    return serverError('Error al auditar huérfanos', e);
  }
}
