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

@Injectable()
export class SocialHoursService {
  private readonly fs = inject<FirestoreService>(FIRESTORE_TOKEN);
  private readonly notifications = inject(NotificationsService);
  private readonly achievements = inject(AchievementsService);

  /**
   * Adjeta `volunteer`, `activity` y `reviewer` (3-way join manual).
   * `reviewer` es una self-FK a Volunteer (puede ser null si la hora fue
   * auto-aprobada por sistema o el reviewer fue eliminado).
   */
  private async enrichHour(h: SocialHourDoc) {
    const [volunteer, activity, reviewer] = await Promise.all([
      h.volunteerId
        ? this.fs.findById<VolunteerDoc>('volunteers', h.volunteerId)
        : Promise.resolve(null),
      h.activityId
        ? this.fs.findById<ActivityDoc>('activities', h.activityId)
        : Promise.resolve(null),
      h.reviewerId
        ? this.fs.findById<VolunteerDoc>('volunteers', h.reviewerId)
        : Promise.resolve(null),
    ]);
    return { ...h, volunteer, activity, reviewer };
  }

  async list(volunteerId?: string, filters: { approvalStatus?: string } = {}) {
    const where: Record<string, unknown> = {};
    if (volunteerId) where.volunteerId = volunteerId;
    if (filters.approvalStatus) where.approvalStatus = filters.approvalStatus;
    const hours = await this.fs.findAll<SocialHourDoc>('socialHours', {
      where,
      orderBy: { field: 'date', direction: 'desc' },
    });
    return Promise.all(hours.map((h) => this.enrichHour(h)));
  }

  /**
   * Crea un registro de hora social.
   * Si `pendingApproval=true` (lo crea el propio voluntario) queda en estado `pending`.
   * Si lo crea un líder/presidente/vice/admin queda directamente `approved`.
   */
  async create(input: CreateSocialHourInput, creatorRole?: Role, creatorId?: string) {
    const approver = canApproveHours(creatorRole);
    const approvalStatus: 'pending' | 'approved' = input.pendingApproval && !approver ? 'pending' : 'approved';

    const created = await this.fs.create<SocialHourDoc>('socialHours', {
      volunteerId: input.volunteerId,
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
            }${enriched.activity ? ` en "${enriched.activity.title}"` : ''}.`
          : `Registraste ${created.hours} hora(s) social(es) de tipo ${
              created.type === 'admin' ? 'administrativa' : 'de campo'
            }${enriched.activity ? ` en "${enriched.activity.title}"` : ''}. Quedan pendientes de aprobación por un líder/presidente/vice.`,
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
        })${enriched.activity ? ` en "${enriched.activity.title}"` : ''}. Revisa y aprueba/rechaza desde la sección Horas Sociales.`,
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

    // Snapshot previo de volunteer/activity para notificaciones (antes de
    // cambiar el doc — aunque estos FKs no se tocan aquí, los necesitamos
    // para el mensaje y para el return shape con includes).
    const [volunteer, activity] = await Promise.all([
      hour.volunteerId
        ? this.fs.findById<VolunteerDoc>('volunteers', hour.volunteerId)
        : Promise.resolve(null),
      hour.activityId
        ? this.fs.findById<ActivityDoc>('activities', hour.activityId)
        : Promise.resolve(null),
    ]);

    await this.fs.update<SocialHourDoc>('socialHours', id, {
      approvalStatus: 'approved',
      reviewerId,
      reviewedAt: new Date().toISOString(),
      rejectionReason: '',
    });

    const updated = await this.fs.findById<SocialHourDoc>('socialHours', id);
    if (!updated) throw new Error('Hora social no encontrada tras actualizar');
    const reviewer = await this.fs.findById<VolunteerDoc>('volunteers', reviewerId);
    const enriched = { ...updated, volunteer, activity, reviewer };

    // Caso 3: notificar al voluntario que se aprobaron sus horas.
    void this.notifications.create({
      userId: hour.volunteerId,
      type: 'social_hour',
      title: `¡Horas aprobadas! +${hour.hours}h`,
      message: `Tu registro de ${hour.hours} hora(s) social(es)${
        activity ? ` en "${activity.title}"` : ''
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

    const [volunteer, activity] = await Promise.all([
      hour.volunteerId
        ? this.fs.findById<VolunteerDoc>('volunteers', hour.volunteerId)
        : Promise.resolve(null),
      hour.activityId
        ? this.fs.findById<ActivityDoc>('activities', hour.activityId)
        : Promise.resolve(null),
    ]);

    await this.fs.update<SocialHourDoc>('socialHours', id, {
      approvalStatus: 'rejected',
      reviewerId,
      reviewedAt: new Date().toISOString(),
      rejectionReason: reason,
    });

    const updated = await this.fs.findById<SocialHourDoc>('socialHours', id);
    if (!updated) throw new Error('Hora social no encontrada tras actualizar');
    const reviewer = await this.fs.findById<VolunteerDoc>('volunteers', reviewerId);
    const enriched = { ...updated, volunteer, activity, reviewer };

    void this.notifications.create({
      userId: hour.volunteerId,
      type: 'social_hour',
      title: `Horas no aprobadas: ${hour.hours}h`,
      message: `Tu registro de ${hour.hours} hora(s) social(es)${
        activity ? ` en "${activity.title}"` : ''
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
