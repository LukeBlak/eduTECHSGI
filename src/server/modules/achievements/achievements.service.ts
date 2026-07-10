/**
 * Achievements Service — CRUD de logros, concesiones y evaluación automática.
 *
 * Migrado de Prisma a Firestore. Los `include` de Prisma se reemplazan por
 * lookups manuales encadenados. Las agregaciones (`aggregate`, `_count` con
 * filtros en relaciones) se hacen client-side porque Firestore no soporta
 * ni aggregations nativas ni where sobre campos de documentos relacionados.
 *
 * Patrones clave (ver auth.service.ts para referencia):
 *  - `inject<FirestoreService>(FIRESTORE_TOKEN)` reemplaza `inject(PRISMA_TOKEN)`.
 *  - Cada `include: { achievement, volunteer, grantedBy }` se reemplaza por
 *    `Promise.all([findById, findById, findById])` por cada doc.
 *  - `aggregate({ _sum: { hours } })` → `findAll` + `.reduce((s,h) => s+h.hours, 0)`.
 *  - `count({ where: { volunteerId, activity: { status: 'completed' } } })`
 *    (filtro sobre relación) → primero traigo los ids de actividades con
 *    `status: 'completed'`, luego `findAll` con `activityId: { op: 'in', value: ids }`
 *    + filter client-side por `volunteerId`.
 *  - `upsert` con compound unique key → `findOne({ volunteerId, achievementId })`
 *    + `create` o `update` según exista.
 */
import { inject, Injectable } from '@/server/core/container';
import { FIRESTORE_TOKEN, type FirestoreService } from '@/server/core/firestore.provider';
import { NotificationsService } from '@/server/modules/notifications/notifications.service';
import { realtime, REALTIME_EVENTS } from '@/lib/realtime-publisher';
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

/** Doc de Achievement tal como se almacena en Firestore. */
interface AchievementDoc {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  points: number;
  auto: boolean;
  autoType: string;
  autoThreshold: number;
  active: boolean;
  repeatable: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Doc de VolunteerAchievement tal como se almacena en Firestore. */
interface VolunteerAchievementDoc {
  id: string;
  volunteerId: string;
  achievementId: string;
  automatic: boolean;
  grantedById: string | null;
  notes: string;
  createdAt: string;
}

interface VolunteerDoc {
  id: string;
  name: string;
  studentId: string;
  email: string;
  role: string;
  [k: string]: unknown;
}

interface SocialHourDoc {
  id: string;
  volunteerId: string;
  hours: number;
  type: 'admin' | 'field';
  approvalStatus: 'pending' | 'approved' | 'rejected';
  [k: string]: unknown;
}

interface ActivityVolunteerDoc {
  id: string;
  activityId: string;
  volunteerId: string;
  status: 'registered' | 'waitlist' | 'cancelled';
  [k: string]: unknown;
}

interface ActivityDoc {
  id: string;
  status: 'active' | 'completed';
  [k: string]: unknown;
}

interface ClassDoc {
  id: string;
  status: 'active' | 'completed';
  [k: string]: unknown;
}

interface ClassVolunteerDoc {
  id: string;
  classId: string;
  volunteerId: string;
  [k: string]: unknown;
}

@Injectable()
export class AchievementsService {
  private readonly fs = inject<FirestoreService>(FIRESTORE_TOKEN);
  private readonly notifications = inject(NotificationsService);

  /**
   * Helper — enriquece un logro con `_count: { volunteers: number }` para
   * preservar el return shape de Prisma `include: { _count: { select: { volunteers: true } } }`.
   */
  private async withCount(achievement: AchievementDoc) {
    const volunteers = await this.fs.count('volunteerAchievements', {
      where: { achievementId: achievement.id },
    });
    return { ...achievement, _count: { volunteers } };
  }

  /**
   * Helper — enriquece un VolunteerAchievement con `achievement` + `volunteer`
   * + `grantedBy` embebidos (preserva el `include` de Prisma).
   */
  private async enrichGrant(
    va: VolunteerAchievementDoc,
    opts: { achievement?: boolean; volunteer?: boolean; grantedBy?: boolean } = {
      achievement: true,
      volunteer: true,
      grantedBy: true,
    },
  ) {
    const [achievement, volunteer, grantedBy] = await Promise.all([
      opts.achievement
        ? this.fs.findById<AchievementDoc>('achievements', va.achievementId)
        : Promise.resolve(null),
      opts.volunteer
        ? this.fs.findById<VolunteerDoc>('volunteers', va.volunteerId)
        : Promise.resolve(null),
      opts.grantedBy && va.grantedById
        ? this.fs.findById<VolunteerDoc>('volunteers', va.grantedById)
        : Promise.resolve(null),
    ]);
    return { ...va, achievement, volunteer, grantedBy };
  }

  /** Lista todos los logros (los admins ven todos; los voluntarios solo los activos). */
  async list(includeInactive = false) {
    const achievements = await this.fs.findAll<AchievementDoc>('achievements', {
      ...(includeInactive ? {} : { where: { active: true } }),
    });
    // Prisma ordenaba por [{ tier: 'asc' }, { points: 'desc' }, { name: 'asc' }].
    // Firestore no soporta multi-field orderBy; ordenamos client-side.
    const tierOrder: Record<string, number> = {
      bronze: 0,
      silver: 1,
      gold: 2,
      platinum: 3,
    };
    achievements.sort((a, b) => {
      const ta = tierOrder[a.tier] ?? 99;
      const tb = tierOrder[b.tier] ?? 99;
      if (ta !== tb) return ta - tb;
      if (b.points !== a.points) return b.points - a.points;
      return a.name.localeCompare(b.name);
    });
    return Promise.all(achievements.map((a) => this.withCount(a)));
  }

  async get(id: string) {
    const achievement = await this.fs.findById<AchievementDoc>('achievements', id);
    if (!achievement) return null;

    const [withCount, grants] = await Promise.all([
      this.withCount(achievement),
      this.fs.findAll<VolunteerAchievementDoc>('volunteerAchievements', {
        where: { achievementId: id },
        orderBy: { field: 'createdAt', direction: 'desc' },
        limit: 200,
      }),
    ]);

    // Enriquecer cada grant con el volunteer embebido (preserva
    // `volunteers: { include: { volunteer: true } }`).
    const volunteers = await Promise.all(
      grants.map(async (va) => {
        const volunteer = va.volunteerId
          ? await this.fs.findById<VolunteerDoc>('volunteers', va.volunteerId)
          : null;
        return { ...va, volunteer };
      }),
    );

    return { ...withCount, volunteers };
  }

  async create(input: CreateAchievementInput) {
    const created = await this.fs.create<AchievementDoc>('achievements', {
      name: input.name,
      description: input.description ?? '',
      icon: input.icon || 'Trophy',
      color: input.color || 'emerald',
      tier: (input.tier as AchievementDoc['tier']) ?? 'bronze',
      points: input.points ?? 0,
      auto: input.auto ?? false,
      autoType: (input.autoType as string) ?? 'none',
      autoThreshold: input.autoThreshold ?? 0,
      active: input.active ?? true,
      repeatable: input.repeatable ?? false,
    });

    void realtime.emit(REALTIME_EVENTS.ACHIEVEMENT_CREATED, { achievementId: created.id });
    void realtime.refreshDashboard({ reason: 'achievement:created' });

    // Si el logro es automático, evaluar inmediatamente para todos los voluntarios.
    if (created.auto && created.autoType !== 'none') {
      void this.evaluateAutoAchievementForAll(created.id).catch((err) => {
        console.warn('[achievements] Error al evaluar logro automático para todos:', err);
      });
    }

    return this.withCount(created);
  }

  async update(id: string, input: UpdateAchievementInput) {
    const data: Record<string, unknown> = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.icon !== undefined ? { icon: input.icon } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.tier !== undefined ? { tier: input.tier } : {}),
      ...(input.points !== undefined ? { points: input.points } : {}),
      ...(input.auto !== undefined ? { auto: input.auto } : {}),
      ...(input.autoType !== undefined ? { autoType: input.autoType } : {}),
      ...(input.autoThreshold !== undefined ? { autoThreshold: input.autoThreshold } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.repeatable !== undefined ? { repeatable: input.repeatable } : {}),
    };
    // Firestore no acepta `undefined` en los payloads — limpiar.
    Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);

    await this.fs.update<AchievementDoc>('achievements', id, data);
    const updated = await this.fs.findById<AchievementDoc>('achievements', id);
    const updatedWithCount = await this.withCount(updated as AchievementDoc);

    void realtime.emit(REALTIME_EVENTS.ACHIEVEMENT_UPDATED, { achievementId: id });
    void realtime.refreshDashboard({ reason: 'achievement:updated' });

    // Si el logro cambió a automático, evaluar inmediatamente.
    if (updatedWithCount.auto && updatedWithCount.autoType !== 'none') {
      void this.evaluateAutoAchievementForAll(id).catch((err) => {
        console.warn('[achievements] Error al re-evaluar logro automático:', err);
      });
    }

    return updatedWithCount;
  }

  async remove(id: string) {
    // Firestore no tiene FK cascade: limpiamos manualmente los volunteerAchievements
    // asociados (onDelete: Cascade en schema Prisma).
    await this.fs.deleteMany('volunteerAchievements', { where: { achievementId: id } });
    await this.fs.remove('achievements', id);
    void realtime.emit(REALTIME_EVENTS.ACHIEVEMENT_DELETED, { achievementId: id });
    void realtime.refreshDashboard({ reason: 'achievement:deleted' });
    return { success: true };
  }

  /** Otorga manualmente un logro a un voluntario (president/vice/admin/líder). */
  async grant(achievementId: string, volunteerId: string, grantedById: string, notes = '') {
    const achievement = await this.fs.findById<AchievementDoc>('achievements', achievementId);
    if (!achievement) throw new Error('Logro no encontrado');

    // upsert: si ya lo tenía, no falla — solo actualiza notas y fecha.
    // Firestore no tiene upsert nativo: findOne + create/update.
    const existing = await this.fs.findOne<VolunteerAchievementDoc>('volunteerAchievements', {
      volunteerId,
      achievementId,
    });

    let va: VolunteerAchievementDoc;
    if (existing) {
      const updateData: Record<string, unknown> = {
        automatic: false,
        grantedById,
      };
      if (notes) updateData.notes = notes;
      await this.fs.update<VolunteerAchievementDoc>('volunteerAchievements', existing.id, updateData);
      const refreshed = await this.fs.findById<VolunteerAchievementDoc>(
        'volunteerAchievements',
        existing.id,
      );
      va = refreshed as VolunteerAchievementDoc;
    } else {
      va = await this.fs.create<VolunteerAchievementDoc>('volunteerAchievements', {
        volunteerId,
        achievementId,
        automatic: false,
        grantedById,
        notes,
      });
    }

    // Enriquecer con achievement + volunteer para preservar el `include` de Prisma.
    const vaWithIncludes = await this.enrichGrant(va, {
      achievement: true,
      volunteer: true,
      grantedBy: false,
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

    return vaWithIncludes;
  }

  /** Revoca un logro previamente otorgado a un voluntario (manual o automático). */
  async revoke(achievementId: string, volunteerId: string) {
    const existing = await this.fs.findOne<VolunteerAchievementDoc>('volunteerAchievements', {
      volunteerId,
      achievementId,
    });
    if (!existing) {
      // Si no existía, no es un error — idempotente.
      return { success: true, existed: false };
    }

    await this.fs.remove('volunteerAchievements', existing.id);

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
    const grants = await this.fs.findAll<VolunteerAchievementDoc>('volunteerAchievements', {
      where: { volunteerId },
      orderBy: { field: 'createdAt', direction: 'desc' },
    });
    // include: { achievement: true, grantedBy: true }
    return Promise.all(
      grants.map((va) =>
        this.enrichGrant(va, { achievement: true, volunteer: false, grantedBy: true }),
      ),
    );
  }

  /** Lista los logros ganados por todos los voluntarios (vista admin). */
  async listAllGrants() {
    const grants = await this.fs.findAll<VolunteerAchievementDoc>('volunteerAchievements', {
      orderBy: { field: 'createdAt', direction: 'desc' },
      limit: 500,
    });
    // include: { achievement, volunteer, grantedBy }
    return Promise.all(
      grants.map((va) =>
        this.enrichGrant(va, { achievement: true, volunteer: true, grantedBy: true }),
      ),
    );
  }

  /**
   * Calcula las métricas de un voluntario para evaluar logros automáticos.
   * Considera solo horas aprobadas, actividades completadas, clases completadas.
   *
   * Reemplaza 4 aggregations de Prisma:
   *  - `socialHour.aggregate({ where: { volunteerId, approvalStatus: 'approved' }, _sum: { hours } })`
   *  - `socialHour.aggregate({ ..., type: 'field' }, _sum: { hours })`
   *  - `socialHour.aggregate({ ..., type: 'admin' }, _sum: { hours })`
   *  - `socialHour.count({ where: { volunteerId, approvalStatus: 'approved' } })`
   * y 2 counts con filtro sobre relación:
   *  - `activityVolunteer.count({ where: { volunteerId, status: 'registered', activity: { status: 'completed' } } })`
   *  - `classVolunteer.count({ where: { volunteerId, class: { status: 'completed' } } })`
   *
   * Firestore no soporta where sobre campos de relaciones. Traemos las listas
   * necesarias y filtramos en memoria.
   */
  async computeMetrics(volunteerId: string): Promise<VolunteerMetrics> {
    // 1) Todas las horas aprobadas del voluntario (para sumas y count).
    const approvedHours = await this.fs.findAll<SocialHourDoc>('socialHours', {
      where: { volunteerId, approvalStatus: 'approved' },
    });
    const hoursTotal = approvedHours.reduce((s, h) => s + (h.hours || 0), 0);
    const fieldHours = approvedHours
      .filter((h) => h.type === 'field')
      .reduce((s, h) => s + (h.hours || 0), 0);
    const adminHours = approvedHours
      .filter((h) => h.type === 'admin')
      .reduce((s, h) => s + (h.hours || 0), 0);
    const socialRecords = approvedHours.length;

    // 2) Actividades completadas (para filtro relacional en activityVolunteer).
    const completedActivities = await this.fs.findAll<ActivityDoc>('activities', {
      where: { status: 'completed' },
    });
    const completedActivityIds = new Set(completedActivities.map((a) => a.id));

    // 3) Actividades en las que el voluntario está registrado (con status='registered').
    // Firestore no soporta `in` con array vacío — guard con Set vacío.
    let activitiesCount = 0;
    if (completedActivityIds.size > 0) {
      const avs = await this.fs.findAll<ActivityVolunteerDoc>('activityVolunteers', {
        where: {
          volunteerId,
          status: 'registered',
          activityId: { op: 'in', value: Array.from(completedActivityIds) },
        },
      });
      activitiesCount = avs.length;
    }

    // 4) Clases completadas (para filtro relacional en classVolunteer).
    const completedClasses = await this.fs.findAll<ClassDoc>('classes', {
      where: { status: 'completed' },
    });
    const completedClassIds = new Set(completedClasses.map((c) => c.id));

    let classesCount = 0;
    if (completedClassIds.size > 0) {
      const cvs = await this.fs.findAll<ClassVolunteerDoc>('classVolunteers', {
        where: {
          volunteerId,
          classId: { op: 'in', value: Array.from(completedClassIds) },
        },
      });
      classesCount = cvs.length;
    }

    return {
      volunteerId,
      hoursTotal,
      fieldHours,
      adminHours,
      socialRecords,
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
        return metrics.hoursTotal >= 5;
      case 'hours_milestone_100':
        return metrics.hoursTotal >= 10;
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
  async evaluateAutoForVolunteer(volunteerId: string): Promise<VolunteerAchievementDoc[]> {
    // achievement.findMany({ where: { active: true, auto: true, autoType: { not: 'none' } } })
    // Firestore no soporta `!=`. Traemos auto=true+active=true y filtramos
    // autoType !== 'none' client-side.
    const autoAchievementsRaw = await this.fs.findAll<AchievementDoc>('achievements', {
      where: { active: true, auto: true },
    });
    const autoAchievements = autoAchievementsRaw.filter((a) => a.autoType && a.autoType !== 'none');
    if (autoAchievements.length === 0) return [];

    const metrics = await this.computeMetrics(volunteerId);
    const granted: VolunteerAchievementDoc[] = [];

    for (const ach of autoAchievements) {
      // volunteerAchievement.findUnique por compound key (volunteerId+achievementId).
      const already = await this.fs.findOne<VolunteerAchievementDoc>('volunteerAchievements', {
        volunteerId,
        achievementId: ach.id,
      });
      if (already) continue;

      if (this.meetsAutoCriteria(ach.autoType, ach.autoThreshold, metrics)) {
        const va = await this.fs.create<VolunteerAchievementDoc>('volunteerAchievements', {
          volunteerId,
          achievementId: ach.id,
          automatic: true,
          notes: '',
        });
        // Prisma devolvía con `include: { achievement, volunteer }`.
        const vaWithIncludes = await this.enrichGrant(va, {
          achievement: true,
          volunteer: true,
          grantedBy: false,
        });
        granted.push(vaWithIncludes as unknown as VolunteerAchievementDoc);

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
    const achievement = await this.fs.findById<AchievementDoc>('achievements', achievementId);
    if (!achievement || !achievement.auto || achievement.autoType === 'none') return;

    const volunteers = await this.fs.findAll<VolunteerDoc>('volunteers', {});
    let granted = 0;
    for (const v of volunteers) {
      try {
        const metrics = await this.computeMetrics(v.id);
        if (this.meetsAutoCriteria(achievement.autoType, achievement.autoThreshold, metrics)) {
          // upsert idempotente: solo crear si no existe (preserva el `update: {}`
          // no-op del original Prisma).
          const existing = await this.fs.findOne<VolunteerAchievementDoc>('volunteerAchievements', {
            volunteerId: v.id,
            achievementId,
          });
          if (existing) continue;

          await this.fs.create<VolunteerAchievementDoc>('volunteerAchievements', {
            volunteerId: v.id,
            achievementId,
            automatic: true,
            notes: '',
          });
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
    const grants = await this.fs.findAll<VolunteerAchievementDoc & { achievement?: AchievementDoc; volunteer?: VolunteerDoc }>(
      'volunteerAchievements',
      { limit: 5000 },
    );

    // Indexar achievements en un solo findAll para evitar N+1.
    const achievementIds = Array.from(new Set(grants.map((g) => g.achievementId)));
    const volunteerIds = Array.from(new Set(grants.map((g) => g.volunteerId)));

    const [achievementDocs, volunteerDocs] = await Promise.all([
      achievementIds.length > 0
        ? Promise.all(achievementIds.map((aid) => this.fs.findById<AchievementDoc>('achievements', aid)))
        : Promise.resolve([]),
      volunteerIds.length > 0
        ? Promise.all(volunteerIds.map((vid) => this.fs.findById<VolunteerDoc>('volunteers', vid)))
        : Promise.resolve([]),
    ]);

    const achievementById = new Map(achievementDocs.filter(Boolean).map((a) => [a!.id, a!]));
    const volunteerById = new Map(volunteerDocs.filter(Boolean).map((v) => [v!.id, v!]));

    const map = new Map<
      string,
      { volunteerId: string; points: number; count: number; volunteer: VolunteerDoc | null }
    >();
    for (const g of grants) {
      const achievement = achievementById.get(g.achievementId);
      const volunteer = volunteerById.get(g.volunteerId) ?? null;
      const entry = map.get(g.volunteerId) ?? {
        volunteerId: g.volunteerId,
        points: 0,
        count: 0,
        volunteer,
      };
      entry.points += achievement?.points ?? 0;
      entry.count += 1;
      if (!entry.volunteer) entry.volunteer = volunteer;
      map.set(g.volunteerId, entry);
    }
    const arr = Array.from(map.values())
      .sort((a, b) => b.points - a.points)
      .slice(0, limit);
    return arr;
  }
}
