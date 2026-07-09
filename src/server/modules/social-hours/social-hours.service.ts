import { inject, Injectable } from '@/server/core/container';
import { PRISMA_TOKEN } from '@/server/core/prisma.provider';
import { NotificationsService } from '@/server/modules/notifications/notifications.service';
import { AchievementsService } from '@/server/modules/achievements/achievements.service';
import { canApproveHours } from '@/server/core/auth.guard';
import type { Role } from '@/server/core/jwt.util';
import { realtime, REALTIME_EVENTS } from '@/lib/realtime-publisher';
import type { CreateSocialHourInput, UpdateSocialHourInput } from './dto/social-hours.dto';

@Injectable()
export class SocialHoursService {
  private readonly db = inject<typeof import('@prisma/client').PrismaClient>(PRISMA_TOKEN);
  private readonly notifications = inject(NotificationsService);
  private readonly achievements = inject(AchievementsService);

  async list(volunteerId?: string, filters: { approvalStatus?: string } = {}) {
    return this.db.socialHour.findMany({
      where: {
        ...(volunteerId ? { volunteerId } : {}),
        ...(filters.approvalStatus ? { approvalStatus: filters.approvalStatus as any } : {}),
      },
      include: { volunteer: true, activity: true, reviewer: true },
      orderBy: { date: 'desc' },
    });
  }

  /**
   * Crea un registro de hora social.
   * Si `pendingApproval=true` (lo crea el propio voluntario) queda en estado `pending`.
   * Si lo crea un líder/presidente/vice/admin queda directamente `approved`.
   */
  async create(input: CreateSocialHourInput, creatorRole?: Role, creatorId?: string) {
    const approver = canApproveHours(creatorRole);
    const approvalStatus = input.pendingApproval && !approver ? 'pending' : 'approved';

    const created = await this.db.socialHour.create({
      data: {
        volunteerId: input.volunteerId,
        activityId: input.activityId || null,
        hours: input.hours,
        type: input.type,
        date: input.date ?? new Date().toISOString().slice(0, 10),
        notes: input.notes ?? '',
        approvalStatus,
        reviewerId: approver && creatorId ? creatorId : null,
        reviewedAt: approver ? new Date() : null,
      },
      include: { volunteer: true, activity: true, reviewer: true },
    });

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
            }${created.activity ? ` en "${created.activity.title}"` : ''}.`
          : `Registraste ${created.hours} hora(s) social(es) de tipo ${
              created.type === 'admin' ? 'administrativa' : 'de campo'
            }${created.activity ? ` en "${created.activity.title}"` : ''}. Quedan pendientes de aprobación por un líder/presidente/vice.`,
      link: '/horas',
      metadata: { hours: created.hours, type: created.type, activityId: created.activityId, approvalStatus },
    });

    if (approvalStatus === 'pending') {
      // Notificar a los aprobadores para que revisen.
      void this.notifications.notifyAdmins({
        type: 'social_hour',
        title: `Hora social pendiente de aprobación`,
        message: `${created.volunteer?.name ?? 'Un voluntario'} registró ${created.hours}h (${created.type === 'admin' ? 'admin' : 'campo'})${created.activity ? ` en "${created.activity.title}"` : ''}. Revisa y aprueba/rechaza desde la sección Horas Sociales.`,
        link: '/horas',
        metadata: { socialHourId: created.id, volunteerId: created.volunteerId, hours: created.hours },
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
      void realtime.emitToUser(created.volunteerId, 'dashboard:refresh', { reason: 'own-hours-changed' });
    }

    // Si la hora quedó aprobada, evaluar logros automáticos del voluntario.
    if (approvalStatus === 'approved' && created.volunteerId) {
      void this.achievements
        .evaluateAutoForVolunteer(created.volunteerId)
        .catch((err) =>
          console.warn('[social-hours] Error al evaluar logros automáticos:', err),
        );
    }

    return created;
  }

  async update(id: string, input: UpdateSocialHourInput) {
    return this.db.socialHour.update({
      where: { id },
      data: input as any,
      include: { volunteer: true, activity: true, reviewer: true },
    });
  }

  /**
   * Aprueba una hora social (Caso 3: Aprobación de horas sociales).
   * Solo líderes/presidente/vice/admin pueden aprobar.
   */
  async approve(id: string, reviewerId: string) {
    const hour = await this.db.socialHour.findUnique({
      where: { id },
      include: { volunteer: true, activity: true },
    });
    if (!hour) throw new Error('Hora social no encontrada');

    const updated = await this.db.socialHour.update({
      where: { id },
      data: {
        approvalStatus: 'approved',
        reviewerId,
        reviewedAt: new Date(),
        rejectionReason: '',
      },
      include: { volunteer: true, activity: true, reviewer: true },
    });

    // Caso 3: notificar al voluntario que se aprobaron sus horas.
    void this.notifications.create({
      userId: hour.volunteerId,
      type: 'social_hour',
      title: `¡Horas aprobadas! +${hour.hours}h`,
      message: `Tu registro de ${hour.hours} hora(s) social(es)${
        hour.activity ? ` en "${hour.activity.title}"` : ''
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
      void realtime.emitToUser(hour.volunteerId, 'dashboard:refresh', { reason: 'own-hours-approved' });
    }

    // Evaluar logros automáticos del voluntario (puede haber desbloqueado nuevos).
    if (hour.volunteerId) {
      void this.achievements
        .evaluateAutoForVolunteer(hour.volunteerId)
        .catch((err) =>
          console.warn('[social-hours] Error al evaluar logros tras aprobación:', err),
        );
    }

    return updated;
  }

  /** Rechaza una hora social. */
  async reject(id: string, reviewerId: string, reason: string = '') {
    const hour = await this.db.socialHour.findUnique({
      where: { id },
      include: { volunteer: true, activity: true },
    });
    if (!hour) throw new Error('Hora social no encontrada');

    const updated = await this.db.socialHour.update({
      where: { id },
      data: {
        approvalStatus: 'rejected',
        reviewerId,
        reviewedAt: new Date(),
        rejectionReason: reason,
      },
      include: { volunteer: true, activity: true, reviewer: true },
    });

    void this.notifications.create({
      userId: hour.volunteerId,
      type: 'social_hour',
      title: `Horas no aprobadas: ${hour.hours}h`,
      message: `Tu registro de ${hour.hours} hora(s) social(es)${
        hour.activity ? ` en "${hour.activity.title}"` : ''
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
      void realtime.emitToUser(hour.volunteerId, 'dashboard:refresh', { reason: 'own-hours-rejected' });
    }

    return updated;
  }

  async remove(id: string) {
    await this.db.socialHour.delete({ where: { id } });
    void realtime.refreshDashboard({ reason: 'social-hour:deleted' });
    return { success: true };
  }
}
