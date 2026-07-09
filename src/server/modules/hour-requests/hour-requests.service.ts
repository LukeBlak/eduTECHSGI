import { inject, Injectable } from '@/server/core/container';
import { PRISMA_TOKEN } from '@/server/core/prisma.provider';
import { NotificationsService } from '@/server/modules/notifications/notifications.service';
import { AchievementsService } from '@/server/modules/achievements/achievements.service';
import type { CreateHourRequestInput, ReviewHourRequestInput } from './dto/hour-requests.dto';

@Injectable()
export class HourRequestsService {
  private readonly db = inject<typeof import('@prisma/client').PrismaClient>(PRISMA_TOKEN);
  private readonly notifications = inject(NotificationsService);
  private readonly achievements = inject(AchievementsService);

  /** Lista todas las solicitudes (para líderes/presidente/vice/admin). */
  async list(filters: { status?: string } = {}) {
    return this.db.hourRequest.findMany({
      where: filters.status ? { status: filters.status as any } : undefined,
      include: { volunteer: true, activity: true, reviewer: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Lista las solicitudes del propio voluntario. */
  async listMine(volunteerId: string) {
    return this.db.hourRequest.findMany({
      where: { volunteerId },
      include: { activity: true, reviewer: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Crea una nueva solicitud de horas adicionales hecha por un voluntario. */
  async create(input: CreateHourRequestInput, volunteerId: string) {
    const created = await this.db.hourRequest.create({
      data: {
        volunteerId,
        activityId: input.activityId || null,
        currentHours: input.currentHours,
        requestedHours: input.requestedHours,
        reason: input.reason,
        status: 'pending',
      },
      include: { volunteer: true, activity: true },
    });

    // Notificar al voluntario que su solicitud fue recibida.
    void this.notifications.create({
      userId: volunteerId,
      type: 'hour_request',
      title: 'Solicitud de horas enviada',
      message: `Tu solicitud de +${input.requestedHours}h${
        created.activity ? ` en "${created.activity.title}"` : ''
      } fue enviada. Queda pendiente de revisión por un líder/presidente/vice.`,
      link: '/solicitudes-horas',
      metadata: { hourRequestId: created.id, requestedHours: input.requestedHours },
    });

    // Notificar a los aprobadores.
    void this.notifications.notifyAdmins({
      type: 'hour_request',
      title: 'Nueva solicitud de horas adicionales',
      message: `${created.volunteer?.name ?? 'Un voluntario'} solicita +${input.requestedHours}h${
        created.activity ? ` en "${created.activity.title}"` : ''
      }. Motivo: ${input.reason}`,
      link: '/solicitudes-horas',
      metadata: { hourRequestId: created.id, volunteerId, requestedHours: input.requestedHours },
    });

    return created;
  }

  /** Aprueba la solicitud: crea la hora social adicional y marca la solicitud como aprobada. */
  async approve(id: string, reviewerId: string, approvedHours?: number) {
    const req = await this.db.hourRequest.findUnique({
      where: { id },
      include: { volunteer: true, activity: true },
    });
    if (!req) throw new Error('Solicitud no encontrada');
    if (req.status !== 'pending') throw new Error('La solicitud ya fue revisada');

    const finalHours = approvedHours ?? req.requestedHours;

    // Crear la hora social adicional, aprobada directamente (la aprueba el reviewer).
    const newHour = await this.db.socialHour.create({
      data: {
        volunteerId: req.volunteerId,
        activityId: req.activityId || null,
        hours: finalHours,
        type: 'field',
        date: new Date().toISOString().slice(0, 10),
        notes: `Hora adicional aprobada por solicitud. Motivo: ${req.reason}`,
        approvalStatus: 'approved',
        reviewerId,
        reviewedAt: new Date(),
      },
    });

    const updated = await this.db.hourRequest.update({
      where: { id },
      data: {
        status: 'approved',
        approvedHours: finalHours,
        reviewerId,
        reviewNotes: '',
        reviewedAt: new Date(),
      },
      include: { volunteer: true, activity: true, reviewer: true },
    });

    // Notificar al voluntario.
    void this.notifications.create({
      userId: req.volunteerId,
      type: 'hour_request',
      title: `¡Solicitud aprobada! +${finalHours}h`,
      message: `Tu solicitud de ${req.requestedHours}h${
        req.activity ? ` en "${req.activity.title}"` : ''
      } fue aprobada${finalHours !== req.requestedHours ? ` (se ajustó a ${finalHours}h)` : ''}. Las horas ya están en tu registro.`,
      link: '/perfil',
      metadata: { hourRequestId: id, approvedHours: finalHours, socialHourId: newHour.id },
    });

    // Evaluar logros automáticos (puede haber desbloqueado nuevos).
    void this.achievements
      .evaluateAutoForVolunteer(req.volunteerId)
      .catch((err) =>
        console.warn('[hour-requests] Error al evaluar logros tras aprobar solicitud:', err),
      );

    return updated;
  }

  /** Rechaza la solicitud. */
  async reject(id: string, reviewerId: string, notes: string = '') {
    const req = await this.db.hourRequest.findUnique({
      where: { id },
      include: { volunteer: true, activity: true },
    });
    if (!req) throw new Error('Solicitud no encontrada');
    if (req.status !== 'pending') throw new Error('La solicitud ya fue revisada');

    const updated = await this.db.hourRequest.update({
      where: { id },
      data: {
        status: 'rejected',
        reviewerId,
        reviewNotes: notes,
        reviewedAt: new Date(),
      },
      include: { volunteer: true, activity: true, reviewer: true },
    });

    void this.notifications.create({
      userId: req.volunteerId,
      type: 'hour_request',
      title: 'Solicitud no aprobada',
      message: `Tu solicitud de +${req.requestedHours}h${
        req.activity ? ` en "${req.activity.title}"` : ''
      } no fue aprobada.${notes ? ` Motivo: ${notes}` : ''}`,
      link: '/solicitudes-horas',
      metadata: { hourRequestId: id, rejected: true, reason: notes },
    });

    return updated;
  }

  async remove(id: string) {
    await this.db.hourRequest.delete({ where: { id } });
    return { success: true };
  }
}
