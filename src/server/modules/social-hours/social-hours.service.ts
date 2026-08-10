/**
 * Social Hours Service — CRUD de horas sociales + aprobación/rechazo.
 *
 * Migrado de Prisma a Firestore. Los `include` de Prisma se reemplazan por
 * lookups manuales encadenados (Firestore no tiene JOINs nativos).
 *
 * El include `volunteer + activity + reviewer` (3-way join) se resuelve con
 * 3 lookups paralelos por registro.
 */
import { inject, Injectable } from '@/server/core/container';
import { FIRESTORE_TOKEN, type FirestoreService } from '@/server/core/firestore.provider';
import { NotificationsService } from '@/server/modules/notifications/notifications.service';
import { AchievementsService } from '@/server/modules/achievements/achievements.service';
import { canApproveHours } from '@/server/core/auth.guard';
import { sanitizeVolunteer } from '@/server/core/sanitize';
import type { Role } from '@/server/core/jwt.util';
import { realtime, REALTIME_EVENTS } from '@/lib/realtime-publisher';
import type { CreateSocialHourInput, UpdateSocialHourInput } from './dto/social-hours.dto';

interface VolunteerDoc {
  id: string;
  name: string;
  studentId: string;
  career: string;
  email: string;
  phone: string;
  password: string;
  role: 'admin' | 'volunteer' | 'committee_leader' | 'president' | 'vice_president';
  committeeId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ActivityDoc {
  id: string;
  title: string;
  description: string;
  objectives: string;
  impact: string;
  type: string;
  startDate: string;
  endDate: string;
  location: string;
  hours: number;
  hourType: 'admin' | 'field';
  capacity: number | null;
  status: 'active' | 'completed';
  completedAt: string | null;
  beneficiariesMen: number;
  beneficiariesWomen: number;
  ods: string;
  committeeId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SocialHourDoc {
  id: string;
  volunteerId: string;
  activityId: string | null;
  /** ID de la clase que originó esta hora (si fue auto-asignada). */
  classId?: string | null;
  hours: number;
  type: 'admin' | 'field';
  date: string;
  notes: string;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  reviewerId: string | null;
  reviewedAt: string | null;
  rejectionReason: string;
  createdAt: string;
  updatedAt: string;
}

interface ClassDoc {
  id: string;
  title: string;
  date: string;
  durationHours: number;
  school: string;
  topic: string;
  description: string;
  status: 'active' | 'completed';
  completedAt: string | null;
  committeeId: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class SocialHoursService {
  private readonly fs = inject<FirestoreService>(FIRESTORE_TOKEN);
  private readonly notifications = inject(NotificationsService);
  private readonly achievements = inject(AchievementsService);

  /**
   * Adjeta `volunteer`, `activity`, `class` y `reviewer` (4-way join manual).
   *
   * Regla de resolución de activityId/classId:
   * - Si `classId` está seteado → la hora proviene de finalizar una clase.
   *   En este caso `activityId` contiene el ID de la clase (no de una
   *   activity real), así que NO hacemos lookup en `activities` (devolvería
   *   null). Sí hacemos lookup en `classes` y lo exponemos como `class`.
   * - Si solo `activityId` está seteado (sin classId) → la hora está
   *   vinculada a una actividad real. Lookup normal en `activities`.
   * - `reviewer` es una self-FK a Volunteer (puede ser null si la hora fue
   *   auto-aprobada por sistema o el reviewer fue eliminado).
   */
  private async enrichHour(h: SocialHourDoc) {
    // Si classId está seteado, activityId referencia una clase (no una
    // activity), así que omitimos el lookup en `activities`.
    const lookupActivity = !!h.activityId && !h.classId;
    const [volunteer, activity, cls, reviewer] = await Promise.all([
      h.volunteerId
        ? this.fs.findById<VolunteerDoc>('volunteers', h.volunteerId)
        : Promise.resolve(null),
      lookupActivity
        ? this.fs.findById<ActivityDoc>('activities', h.activityId!)
        : Promise.resolve(null),
      h.classId
        ? this.fs.findById<ClassDoc>('classes', h.classId)
        : Promise.resolve(null),
      h.reviewerId
        ? this.fs.findById<VolunteerDoc>('volunteers', h.reviewerId)
        : Promise.resolve(null),
    ]);
    return { ...h, volunteer: sanitizeVolunteer(volunteer), class: cls, reviewer: sanitizeVolunteer(reviewer) };
  }

  async list(volunteerId?: string, filters: { approvalStatus?: string } = {}) {
    const where: Record<string, unknown> = {};
    if (volunteerId) where.volunteerId = volunteerId;
    if (filters.approvalStatus) where.approvalStatus = filters.approvalStatus;
    const hours = await this.fs.findAll<SocialHourDoc>('socialHours', {
      where,
      orderBy: { field: 'date', direction: 'desc' },
    });
    const enriched = await Promise.all(hours.map((h) => this.enrichHour(h)));

    // ─── Self-healing: limpiar horas huérfanas ───────────────────────
    // Una hora huérfana es aquella cuyo origen (class o activity) fue
    // eliminado sin cascada. Esto pasa con datos legacy creados antes
    // de FIX-7 (activities) / FIX-8 (classes), que añadieron el
    // deleteMany cascada a los respectivos remove().
    //
    // Casos detectados:
    //  1. classId seteado pero class no existe → clase borrada sin cascada
    //  2. activityId seteado (sin classId) pero activity no existe →
    //     actividad borrada sin cascada
    //  3. LEGACY (pre-FIX-5): sin classId, pero notes contiene
    //     `[clase:ID]` y la clase ya no existe
    //
    // Los orphans se borran (fire-and-forget) y se excluyen del list
    // retornado, así desaparecen automáticamente de la UI al cargar
    // la página de Horas Sociales.
    const orphanIds = new Set<string>();

    // Casos 1 y 2: orphans detectables desde el enrich (class/activity null).
    for (const h of enriched) {
      if (h.classId && !h.class) orphanIds.add(h.id);
      else if (h.activityId && !h.classId && !h.activity) orphanIds.add(h.id);
    }

    // Caso 3: legacy con marker `[clase:ID]` en notes. Necesitamos
    // verificar existencia de la clase (lookup extra).
    const legacyClassRe = /\[clase:([^\]]+)\]/;
    const legacyChecks = enriched
      .filter(
        (h) => !h.classId && h.notes && legacyClassRe.test(h.notes),
      )
      .map(async (h) => {
        const match = h.notes.match(legacyClassRe);
        const legacyClassId = match?.[1];
        if (!legacyClassId) return;
        const cls = await this.fs.findById<ClassDoc>('classes', legacyClassId);
        if (!cls) orphanIds.add(h.id); // clase inexistente → orphan
      });
    await Promise.all(legacyChecks);

    // Borrar orphans (fire-and-forget, no bloquea el response).
    if (orphanIds.size > 0) {
      void Promise.all(
        [...orphanIds].map((id) => this.fs.remove('socialHours', id)),
      ).catch((err) =>
        console.warn('[social-hours] Error al limpiar horas huérfanas:', err),
      );
    }

    // Excluir orphans del listado retornado.
    return enriched.filter((h) => !orphanIds.has(h.id));
  }

  /**
   * Crea un registro de hora social.
   * Si `pendingApproval=true` (lo crea el propio voluntario) queda en estado `pending`.
   * Si lo crea un líder/presidente/vice/admin queda directamente `approved`.
   */
  async create(input: CreateSocialHourInput, creatorRole?: Role, creatorId?: string) {
    const approver = canApproveHours(creatorRole);
    const approvalStatus: 'pending' | 'approved' = input.pendingApproval && !approver ? 'pending' : 'approved';

    // IDOR fix: un voluntario (no approver) solo puede crear horas PARA SÍ MISMO.
    // Ignoramos el volunteerId del body y forzamos el del creador.
    // Los approvers (admin/líder/presidente/vice) sí pueden crear horas para
    // cualquier voluntario.
    const volunteerId = approver ? input.volunteerId : (creatorId ?? input.volunteerId);

    const created = await this.fs.create<SocialHourDoc>('socialHours', {
      volunteerId,
      activityId: input.activityId || null,
      hours: input.hours,
      type: input.type,
      date: input.date ?? new Date().toISOString().slice(0, 10),
      notes: input.notes ?? '',
      approvalStatus,
      reviewerId: approver && creatorId ? creatorId : null,
      reviewedAt: approver ? new Date().toISOString() : null,
    });

    const enriched = await this.enrichHour(created);
    const sourceTitle = enriched.activity?.title || enriched.class?.title;

    // Notifica al voluntario.
    void this.notifications.create({
      userId: created.volunteerId,
      type: 'social_hour',
      title:
        approvalStatus === 'approved'
          ? `${created.hours}h sociales aprobadas`
          : `${created.hours}h sociales registradas (pendiente de aprobación)`,
      message:
        approvalStatus === 'approved'
          ? `Se te aprobaron ${created.hours} hora(s) social(es) de tipo ${
              created.type === 'admin' ? 'administrativa' : 'de campo'
            }${sourceTitle ? ` en "${sourceTitle}"` : ''}.`
          : `Registraste ${created.hours} hora(s) social(es) de tipo ${
              created.type === 'admin' ? 'administrativa' : 'de campo'
            }${sourceTitle ? ` en "${sourceTitle}"` : ''}. Quedan pendientes de aprobación por un líder/presidente/vice.`,
      link: '/horas',
      metadata: {
        hours: created.hours,
        type: created.type,
        activityId: created.activityId,
        approvalStatus,
      },
    });

    if (approvalStatus === 'pending') {
      // Notificar a los aprobadores para que revisen.
      void this.notifications.notifyAdmins({
        type: 'social_hour',
        title: `Hora social pendiente de aprobación`,
        message: `${enriched.volunteer?.name ?? 'Un voluntario'} registró ${created.hours}h (${
          created.type === 'admin' ? 'admin' : 'campo'
        })${sourceTitle ? ` en "${sourceTitle}"` : ''}. Revisa y aprueba/rechaza desde la sección Horas Sociales.`,
        link: '/horas',
        metadata: {
          socialHourId: created.id,
          volunteerId: created.volunteerId,
          hours: created.hours,
        },
      });
    }

    // Realtime: refrescar dashboard + perfil del voluntario + lista de horas.
    void realtime.emit(REALTIME_EVENTS.SOCIAL_HOUR_CREATED, {
      socialHourId: created.id,
      volunteerId: created.volunteerId,
      hours: created.hours,
      approvalStatus,
    });
    void realtime.refreshDashboard({ reason: 'social-hour:created' });
    // Avisar al propio voluntario para que su perfil se actualice.
    if (created.volunteerId) {
      void realtime.emitToUser(created.volunteerId, 'dashboard:refresh', {
        reason: 'own-hours-changed',
      });
    }

    // Si la hora quedó aprobada, evaluar logros automáticos del voluntario.
    if (approvalStatus === 'approved' && created.volunteerId) {
      void this.achievements
        .evaluateAutoForVolunteer(created.volunteerId)
        .catch((err) =>
          console.warn('[social-hours] Error al evaluar logros automáticos:', err),
        );
    }

    return enriched;
  }

  async update(id: string, input: UpdateSocialHourInput) {
    // Firestore no acepta `undefined` en los payloads — limpiar.
    const data: Record<string, unknown> = { ...input };
    Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);
    await this.fs.update<SocialHourDoc>('socialHours', id, data);
    const updated = await this.fs.findById<SocialHourDoc>('socialHours', id);
    if (!updated) throw new Error('Hora social no encontrada');
    return this.enrichHour(updated);
  }

  /**
   * Aprueba una hora social (Caso 3: Aprobación de horas sociales).
   * Solo líderes/presidente/vice/admin pueden aprobar.
   */
  async approve(id: string, reviewerId: string) {
    const hour = await this.fs.findById<SocialHourDoc>('socialHours', id);
    if (!hour) throw new Error('Hora social no encontrada');

    // Status guard: no se puede aprobar una hora que ya fue procesada
    // (aprobada o rechazada). Previene doble aprobación y reversiones
    // silenciosas.
    if (hour.approvalStatus !== 'pending') {
      throw new Error(
        `No se puede aprobar: la hora ya está ${hour.approvalStatus === 'approved' ? 'aprobada' : 'rechazada'}`,
      );
    }

    // Snapshot previo de volunteer/activity/class para notificaciones.
    // Si classId está seteado, activityId referencia una clase (no una activity),
    // así que no buscamos en `activities`.
    const lookupActivity = !!hour.activityId && !hour.classId;
    const [volunteer, activity, cls] = await Promise.all([
      hour.volunteerId
        ? this.fs.findById<VolunteerDoc>('volunteers', hour.volunteerId)
        : Promise.resolve(null),
      lookupActivity
        ? this.fs.findById<ActivityDoc>('activities', hour.activityId!)
        : Promise.resolve(null),
      hour.classId
        ? this.fs.findById<ClassDoc>('classes', hour.classId)
        : Promise.resolve(null),
    ]);
    const sourceTitle = activity?.title || cls?.title;

    await this.fs.update<SocialHourDoc>('socialHours', id, {
      approvalStatus: 'approved',
      reviewerId,
      reviewedAt: new Date().toISOString(),
      rejectionReason: '',
    });

    const updated = await this.fs.findById<SocialHourDoc>('socialHours', id);
    if (!updated) throw new Error('Hora social no encontrada tras actualizar');
    const reviewer = await this.fs.findById<VolunteerDoc>('volunteers', reviewerId);
    const enriched = { ...updated, volunteer, activity, class: cls, reviewer };

    // Caso 3: notificar al voluntario que se aprobaron sus horas.
    void this.notifications.create({
      userId: hour.volunteerId,
      type: 'social_hour',
      title: `¡Horas aprobadas! +${hour.hours}h`,
      message: `Tu registro de ${hour.hours} hora(s) social(es)${
        sourceTitle ? ` en "${sourceTitle}"` : ''
      } fue aprobado. Total acumulado revisa tu perfil.`,
      link: '/perfil',
      metadata: { socialHourId: id, hours: hour.hours, approved: true },
    });

    // Realtime: refrescar todo (dashboard, perfil del voluntario, ranking).
    void realtime.emit(REALTIME_EVENTS.SOCIAL_HOUR_APPROVED, {
      socialHourId: id,
      volunteerId: hour.volunteerId,
      hours: hour.hours,
    });
    void realtime.refreshDashboard({ reason: 'social-hour:approved' });
    if (hour.volunteerId) {
      void realtime.emitToUser(hour.volunteerId, 'dashboard:refresh', {
        reason: 'own-hours-approved',
      });
    }

    // Evaluar logros automáticos del voluntario (puede haber desbloqueado nuevos).
    if (hour.volunteerId) {
      void this.achievements
        .evaluateAutoForVolunteer(hour.volunteerId)
        .catch((err) =>
          console.warn('[social-hours] Error al evaluar logros tras aprobación:', err),
        );
    }

    return enriched;
  }

  /** Rechaza una hora social. */
  async reject(id: string, reviewerId: string, reason: string = '') {
    const hour = await this.fs.findById<SocialHourDoc>('socialHours', id);
    if (!hour) throw new Error('Hora social no encontrada');

    // Status guard: no se puede rechazar una hora que ya fue procesada.
    if (hour.approvalStatus !== 'pending') {
      throw new Error(
        `No se puede rechazar: la hora ya está ${hour.approvalStatus === 'approved' ? 'aprobada' : 'rechazada'}`,
      );
    }

    const lookupActivity = !!hour.activityId && !hour.classId;
    const [volunteer, activity, cls] = await Promise.all([
      hour.volunteerId
        ? this.fs.findById<VolunteerDoc>('volunteers', hour.volunteerId)
        : Promise.resolve(null),
      lookupActivity
        ? this.fs.findById<ActivityDoc>('activities', hour.activityId!)
        : Promise.resolve(null),
      hour.classId
        ? this.fs.findById<ClassDoc>('classes', hour.classId)
        : Promise.resolve(null),
    ]);
    const sourceTitle = activity?.title || cls?.title;

    await this.fs.update<SocialHourDoc>('socialHours', id, {
      approvalStatus: 'rejected',
      reviewerId,
      reviewedAt: new Date().toISOString(),
      rejectionReason: reason,
    });

    const updated = await this.fs.findById<SocialHourDoc>('socialHours', id);
    if (!updated) throw new Error('Hora social no encontrada tras actualizar');
    const reviewer = await this.fs.findById<VolunteerDoc>('volunteers', reviewerId);
    const enriched = { ...updated, volunteer, activity, class: cls, reviewer };

    void this.notifications.create({
      userId: hour.volunteerId,
      type: 'social_hour',
      title: `Horas no aprobadas: ${hour.hours}h`,
      message: `Tu registro de ${hour.hours} hora(s) social(es)${
        sourceTitle ? ` en "${sourceTitle}"` : ''
      } no fue aprobado.${reason ? ` Motivo: ${reason}` : ''}`,
      link: '/horas',
      metadata: { socialHourId: id, hours: hour.hours, rejected: true, reason },
    });

    void realtime.emit(REALTIME_EVENTS.SOCIAL_HOUR_REJECTED, {
      socialHourId: id,
      volunteerId: hour.volunteerId,
      reason,
    });
    void realtime.refreshDashboard({ reason: 'social-hour:rejected' });
    if (hour.volunteerId) {
      void realtime.emitToUser(hour.volunteerId, 'dashboard:refresh', {
        reason: 'own-hours-rejected',
      });
    }

    return enriched;
  }

  async remove(id: string) {
    await this.fs.remove('socialHours', id);
    void realtime.refreshDashboard({ reason: 'social-hour:deleted' });
    return { success: true };
  }
}
