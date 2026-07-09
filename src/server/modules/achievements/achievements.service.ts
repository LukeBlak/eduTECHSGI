import { inject, Injectable } from '@/server/core/container';
import { PRISMA_TOKEN } from '@/server/core/prisma.provider';
import { NotificationsService } from '@/server/modules/notifications/notifications.service';
import { realtime, REALTIME_EVENTS } from '@/lib/realtime-publisher';
import type { PrismaClient, Achievement, VolunteerAchievement } from '@prisma/client';
import type { CreateAchievementInput, UpdateAchievementInput } from './dto/achievements.dto';

/** Métricas que el sistema usa para evaluar logros automáticos de un voluntario. */
export interface VolunteerMetrics {
  volunteerId: string;
  hoursTotal: number;
  fieldHours: number;
  adminHours: number;
  socialRecords: number;
  activitiesCount: number;
  classesCount: number;
}

@Injectable()
export class AchievementsService {
  private readonly db = inject<PrismaClient>(PRISMA_TOKEN);
  private readonly notifications = inject(NotificationsService);

  /** Lista todos los logros (los admins ven todos; los voluntarios solo los activos). */
  async list(includeInactive = false) {
    return this.db.achievement.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: [{ tier: 'asc' }, { points: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { volunteers: true } } },
    });
  }

  async get(id: string) {
    return this.db.achievement.findUnique({
      where: { id },
      include: {
        _count: { select: { volunteers: true } },
        volunteers: {
          include: { volunteer: true },
          orderBy: { createdAt: 'desc' },
          take: 200,
        },
      },
    });
  }

  async create(input: CreateAchievementInput) {
    const created = await this.db.achievement.create({
      data: {
        name: input.name,
        description: input.description ?? '',
        icon: input.icon || 'Trophy',
        color: input.color || 'emerald',
        tier: (input.tier as any) ?? 'bronze',
        points: input.points ?? 0,
        auto: input.auto ?? false,
        autoType: (input.autoType as any) ?? 'none',
        autoThreshold: input.autoThreshold ?? 0,
        active: input.active ?? true,
        repeatable: input.repeatable ?? false,
      },
      include: { _count: { select: { volunteers: true } } },
    });

    void realtime.emit(REALTIME_EVENTS.ACHIEVEMENT_CREATED, { achievementId: created.id });
    void realtime.refreshDashboard({ reason: 'achievement:created' });

    // Si el logro es automático, evaluar inmediatamente para todos los voluntarios.
    if (created.auto && created.autoType !== 'none') {
      void this.evaluateAutoAchievementForAll(created.id).catch((err) => {
        console.warn('[achievements] Error al evaluar logro automático para todos:', err);
      });
    }

    return created;
  }

  async update(id: string, input: UpdateAchievementInput) {
    const updated = await this.db.achievement.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.tier !== undefined ? { tier: input.tier as any } : {}),
        ...(input.points !== undefined ? { points: input.points } : {}),
        ...(input.auto !== undefined ? { auto: input.auto } : {}),
        ...(input.autoType !== undefined ? { autoType: input.autoType as any } : {}),
        ...(input.autoThreshold !== undefined ? { autoThreshold: input.autoThreshold } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.repeatable !== undefined ? { repeatable: input.repeatable } : {}),
      },
      include: { _count: { select: { volunteers: true } } },
    });

    void realtime.emit(REALTIME_EVENTS.ACHIEVEMENT_UPDATED, { achievementId: id });
    void realtime.refreshDashboard({ reason: 'achievement:updated' });

    // Si el logro cambió a automático, evaluar inmediatamente.
    if (updated.auto && updated.autoType !== 'none') {
      void this.evaluateAutoAchievementForAll(id).catch((err) => {
        console.warn('[achievements] Error al re-evaluar logro automático:', err);
      });
    }

    return updated;
  }

  async remove(id: string) {
    await this.db.achievement.delete({ where: { id } });
    void realtime.emit(REALTIME_EVENTS.ACHIEVEMENT_DELETED, { achievementId: id });
    void realtime.refreshDashboard({ reason: 'achievement:deleted' });
    return { success: true };
  }

  /** Otorga manualmente un logro a un voluntario (president/vice/admin/líder). */
  async grant(achievementId: string, volunteerId: string, grantedById: string, notes = '') {
    const achievement = await this.db.achievement.findUnique({ where: { id: achievementId } });
    if (!achievement) throw new Error('Logro no encontrado');

    // upsert: si ya lo tenía, no falla — solo actualiza notas y fecha.
    const va = await this.db.volunteerAchievement.upsert({
      where: {
        volunteerId_achievementId: { volunteerId, achievementId },
      },
      create: {
        volunteerId,
        achievementId,
        automatic: false,
        grantedById,
        notes,
      },
      update: {
        automatic: false,
        grantedById,
        notes: notes || undefined,
      },
      include: { achievement: true, volunteer: true },
    });

    // Notificar al voluntario.
    void this.notifications.create({
      userId: volunteerId,
      type: 'system',
      title: `¡Nuevo logro desbloqueado! ${achievement.name}`,
      message: `El equipo de EduTECH ESEN te ha otorgado el logro "${achievement.name}"${
        achievement.points > 0 ? ` (+${achievement.points} pts)` : ''
      }.${notes ? ` Nota: ${notes}` : ''}`,
      link: '/logros',
      metadata: {
        achievementId,
        achievementName: achievement.name,
        tier: achievement.tier,
        points: achievement.points,
        manual: true,
      },
    });

    void realtime.emit(REALTIME_EVENTS.ACHIEVEMENT_GRANTED, {
      achievementId,
      volunteerId,
      manual: true,
    });
    void realtime.emitToUser(volunteerId, 'achievement:granted', { achievementId });
    void realtime.refreshDashboard({ reason: 'achievement:granted' });

    return va;
  }

  /** Revoca un logro previamente otorgado a un voluntario (manual o automático). */
  async revoke(achievementId: string, volunteerId: string) {
    try {
      await this.db.volunteerAchievement.delete({
        where: {
          volunteerId_achievementId: { volunteerId, achievementId },
        },
      });
    } catch {
      // Si no existía, no es un error — idempotente.
      return { success: true, existed: false };
    }

    void realtime.emit(REALTIME_EVENTS.ACHIEVEMENT_REVOKED, {
      achievementId,
      volunteerId,
    });
    void realtime.emitToUser(volunteerId, 'achievement:revoked', { achievementId });
    void realtime.refreshDashboard({ reason: 'achievement:revoked' });

    return { success: true, existed: true };
  }

  /** Lista los logros ganados por un voluntario. */
  async listByVolunteer(volunteerId: string) {
    return this.db.volunteerAchievement.findMany({
      where: { volunteerId },
      include: { achievement: true, grantedBy: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Lista los logros ganados por todos los voluntarios (vista admin). */
  async listAllGrants() {
    return this.db.volunteerAchievement.findMany({
      include: {
        achievement: true,
        volunteer: true,
        grantedBy: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  /**
   * Calcula las métricas de un voluntario para evaluar logros automáticos.
   * Considera solo horas aprobadas, actividades completadas, clases completadas.
   */
  async computeMetrics(volunteerId: string): Promise<VolunteerMetrics> {
    const [hoursAgg, activitiesCount, classesCount, recordsCount] = await Promise.all([
      this.db.socialHour.aggregate({
        where: { volunteerId, approvalStatus: 'approved' },
        _sum: { hours: true },
      }),
      this.db.activityVolunteer.count({
        where: {
          volunteerId,
          status: 'registered',
          activity: { status: 'completed' },
        },
      }),
      this.db.classVolunteer.count({
        where: {
          volunteerId,
          class: { status: 'completed' },
        },
      }),
      this.db.socialHour.count({
        where: { volunteerId, approvalStatus: 'approved' },
      }),
    ]);

    // Distinguir horas de campo vs administrativas.
    const [fieldAgg, adminAgg] = await Promise.all([
      this.db.socialHour.aggregate({
        where: { volunteerId, approvalStatus: 'approved', type: 'field' },
        _sum: { hours: true },
      }),
      this.db.socialHour.aggregate({
        where: { volunteerId, approvalStatus: 'approved', type: 'admin' },
        _sum: { hours: true },
      }),
    ]);

    return {
      volunteerId,
      hoursTotal: hoursAgg._sum.hours ?? 0,
      fieldHours: fieldAgg._sum.hours ?? 0,
      adminHours: adminAgg._sum.hours ?? 0,
      socialRecords: recordsCount,
      activitiesCount,
      classesCount,
    };
  }

  /** Evalúa si el voluntario cumple el criterio automático de un logro. */
  private meetsAutoCriteria(
    autoType: string,
    threshold: number,
    metrics: VolunteerMetrics,
  ): boolean {
    switch (autoType) {
      case 'hours_total':
        return metrics.hoursTotal >= threshold;
      case 'field_hours':
        return metrics.fieldHours >= threshold;
      case 'admin_hours':
        return metrics.adminHours >= threshold;
      case 'activities_count':
        return metrics.activitiesCount >= threshold;
      case 'classes_count':
        return metrics.classesCount >= threshold;
      case 'social_records':
        return metrics.socialRecords >= threshold;
      case 'first_activity':
        return metrics.activitiesCount >= 1;
      case 'hours_milestone_50':
        return metrics.hoursTotal >= 50;
      case 'hours_milestone_100':
        return metrics.hoursTotal >= 100;
      case 'none':
      default:
        return false;
    }
  }

  /**
   * Evalúa todos los logros automáticos activos para un voluntario y otorga
   * los que cumpla pero no tenga todavía. Es idempotente.
   * Devuelve la lista de logros recién otorgados.
   */
  async evaluateAutoForVolunteer(volunteerId: string): Promise<VolunteerAchievement[]> {
    const autoAchievements = await this.db.achievement.findMany({
      where: { active: true, auto: true, autoType: { not: 'none' } },
    });
    if (autoAchievements.length === 0) return [];

    const metrics = await this.computeMetrics(volunteerId);
    const granted: VolunteerAchievement[] = [];

    for (const ach of autoAchievements) {
      const already = await this.db.volunteerAchievement.findUnique({
        where: {
          volunteerId_achievementId: { volunteerId, achievementId: ach.id },
        },
      });
      if (already) continue;

      if (this.meetsAutoCriteria(ach.autoType, ach.autoThreshold, metrics)) {
        const va = await this.db.volunteerAchievement.create({
          data: {
            volunteerId,
            achievementId: ach.id,
            automatic: true,
          },
          include: { achievement: true, volunteer: true },
        });
        granted.push(va);

        // Notificar al voluntario.
        void this.notifications.create({
          userId: volunteerId,
          type: 'system',
          title: `¡Logro desbloqueado! ${ach.name}`,
          message: `Has ganado el logro "${ach.name}"${
            ach.points > 0 ? ` (+${ach.points} pts)` : ''
          }. ¡Sigue así!`,
          link: '/logros',
          metadata: {
            achievementId: ach.id,
            achievementName: ach.name,
            tier: ach.tier,
            points: ach.points,
            manual: false,
          },
        });
        void realtime.emitToUser(volunteerId, 'achievement:granted', {
          achievementId: ach.id,
          automatic: true,
        });
      }
    }

    if (granted.length > 0) {
      void realtime.emit(REALTIME_EVENTS.ACHIEVEMENT_GRANTED, {
        volunteerId,
        count: granted.length,
        automatic: true,
      });
      void realtime.refreshDashboard({ reason: 'achievement:auto-granted' });
    }

    return granted;
  }

  /** Evalúa un logro automático específico para todos los voluntarios (recién creado). */
  private async evaluateAutoAchievementForAll(achievementId: string) {
    const achievement = await this.db.achievement.findUnique({ where: { id: achievementId } });
    if (!achievement || !achievement.auto || achievement.autoType === 'none') return;

    const volunteers = await this.db.volunteer.findMany({ select: { id: true } });
    let granted = 0;
    for (const v of volunteers) {
      try {
        const metrics = await this.computeMetrics(v.id);
        if (this.meetsAutoCriteria(achievement.autoType, achievement.autoThreshold, metrics)) {
          const created = await this.db.volunteerAchievement.upsert({
            where: {
              volunteerId_achievementId: { volunteerId: v.id, achievementId },
            },
            create: {
              volunteerId: v.id,
              achievementId,
              automatic: true,
            },
            update: {},
          });
          // Si fue creado ahora (no existía antes), cuenta.
          const exists = await this.db.volunteerAchievement.findUnique({
            where: {
              volunteerId_achievementId: { volunteerId: v.id, achievementId },
            },
          });
          if (exists && exists.createdAt > new Date(Date.now() - 60_000)) {
            granted++;
            void this.notifications.create({
              userId: v.id,
              type: 'system',
              title: `¡Logro desbloqueado! ${achievement.name}`,
              message: `Has ganado el logro "${achievement.name}"${
                achievement.points > 0 ? ` (+${achievement.points} pts)` : ''
              }. ¡Sigue así!`,
              link: '/logros',
              metadata: {
                achievementId: achievement.id,
                achievementName: achievement.name,
                tier: achievement.tier,
                points: achievement.points,
                manual: false,
              },
            });
            void realtime.emitToUser(v.id, 'achievement:granted', {
              achievementId,
              automatic: true,
            });
          }
          void created;
        }
      } catch (err) {
        console.warn(`[achievements] Error evaluando ${achievementId} para ${v.id}:`, err);
      }
    }
    if (granted > 0) {
      void realtime.emit(REALTIME_EVENTS.ACHIEVEMENT_GRANTED, {
        achievementId,
        count: granted,
        automatic: true,
      });
      void realtime.refreshDashboard({ reason: 'achievement:auto-granted-bulk' });
    }
  }

  /** Resumen: puntaje total y conteo de logros por voluntario (para ranking). */
  async leaderboard(limit = 20) {
    const grants = await this.db.volunteerAchievement.findMany({
      include: { achievement: true, volunteer: true },
      take: 5000,
    });
    const map = new Map<
      string,
      { volunteerId: string; points: number; count: number; volunteer: any }
    >();
    for (const g of grants) {
      const entry = map.get(g.volunteerId) ?? {
        volunteerId: g.volunteerId,
        points: 0,
        count: 0,
        volunteer: g.volunteer,
      };
      entry.points += g.achievement.points;
      entry.count += 1;
      map.set(g.volunteerId, entry);
    }
    const arr = Array.from(map.values())
      .sort((a, b) => b.points - a.points)
      .slice(0, limit);
    return arr;
  }
}
