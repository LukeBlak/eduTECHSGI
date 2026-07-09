/**
 * Activities Service — CRUD de actividades, inscripciones y finalización.
 *
 * Migrado de Prisma a Firestore. Los `include` de Prisma se reemplazan por
 * lookups manuales encadenados (Firestore no tiene JOINs nativos).
 */
import { inject, Injectable } from '@/server/core/container';
import { FIRESTORE_TOKEN, type FirestoreService } from '@/server/core/firestore.provider';
import { NotificationsService } from '@/server/modules/notifications/notifications.service';
import { AchievementsService } from '@/server/modules/achievements/achievements.service';
import { realtime, REALTIME_EVENTS } from '@/lib/realtime-publisher';
import type { CreateActivityInput, UpdateActivityInput } from './dto/activities.dto';

interface VolunteerDoc {
  id: string;
  name: string;
  studentId: string;
  email: string;
  [k: string]: unknown;
}

interface CommitteeDoc {
  id: string;
  name: string;
  description: string;
  color: string;
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

interface ActivityVolunteerDoc {
  id: string;
  activityId: string;
  volunteerId: string;
  status: 'registered' | 'waitlist' | 'cancelled';
  createdAt: string;
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

/** Resultado de una operación de inscripción a una actividad. */
export interface SubscribeResult {
  success: boolean;
  message: string;
  status: 'registered' | 'waitlist' | 'cancelled' | 'already';
  activityId: string;
  volunteerId: string;
  registeredCount: number;
  capacity: number | null;
  available: number | null;
}

/** Resultado de finalizar una actividad. */
export interface CompleteResult {
  success: boolean;
  message: string;
  activityId: string;
  title: string;
  hoursPerVolunteer: number;
  hourType: 'admin' | 'field';
  assignedCount: number;
  skipped: { volunteerId: string; reason: string }[];
  alreadyCompleted: boolean;
}

@Injectable()
export class ActivitiesService {
  private readonly fs = inject<FirestoreService>(FIRESTORE_TOKEN);
  private readonly notifications = inject(NotificationsService);
  private readonly achievements = inject(AchievementsService);

  async list() {
    const activities = await this.fs.findAll<ActivityDoc>('activities', {
      orderBy: { field: 'createdAt', direction: 'desc' },
    });
    const items = await Promise.all(
      activities.map(async (a) => {
        const [committee, activityVolunteers, socialHoursCount] = await Promise.all([
          a.committeeId
            ? this.fs.findById<CommitteeDoc>('committees', a.committeeId)
            : Promise.resolve(null),
          this.fs.findAll<ActivityVolunteerDoc>('activityVolunteers', {
            where: { activityId: a.id },
          }),
          this.fs.count('socialHours', { where: { activityId: a.id } }),
        ]);
        const volunteers = await Promise.all(
          activityVolunteers.map(async (av) => {
            const volunteer = av.volunteerId
              ? await this.fs.findById<VolunteerDoc>('volunteers', av.volunteerId)
              : null;
            return { ...av, volunteer };
          }),
        );
        return { ...a, committee, volunteers, _count: { socialHours: socialHoursCount } };
      }),
    );
    return items.map((a) => this.serialize(a));
  }

  async getById(id: string) {
    const a = await this.fs.findById<ActivityDoc>('activities', id);
    if (!a) return null;

    const [committee, activityVolunteers, socialHours] = await Promise.all([
      a.committeeId
        ? this.fs.findById<CommitteeDoc>('committees', a.committeeId)
        : Promise.resolve(null),
      this.fs.findAll<ActivityVolunteerDoc>('activityVolunteers', { where: { activityId: id } }),
      this.fs.findAll<SocialHourDoc>('socialHours', { where: { activityId: id } }),
    ]);

    const [volunteers, socialHoursWithVolunteer] = await Promise.all([
      Promise.all(
        activityVolunteers.map(async (av) => {
          const volunteer = av.volunteerId
            ? await this.fs.findById<VolunteerDoc>('volunteers', av.volunteerId)
            : null;
          return { ...av, volunteer };
        }),
      ),
      Promise.all(
        socialHours.map(async (sh) => {
          const volunteer = sh.volunteerId
            ? await this.fs.findById<VolunteerDoc>('volunteers', sh.volunteerId)
            : null;
          return { ...sh, volunteer };
        }),
      ),
    ]);

    const activityWithIncludes = { ...a, committee, volunteers, socialHours: socialHoursWithVolunteer };
    return {
      ...this.serialize(activityWithIncludes),
      socialHours: socialHoursWithVolunteer,
    };
  }

  async create(input: CreateActivityInput) {
    const { volunteerIds = [], ods = [], capacity = null, hourType = 'field', ...rest } = input;

    const created = await this.fs.create<ActivityDoc>('activities', {
      title: rest.title,
      description: rest.description ?? '',
      objectives: rest.objectives ?? '',
      impact: rest.impact ?? '',
      type: rest.type ?? 'EduTECH ESEN',
      startDate: rest.startDate ?? '',
      endDate: rest.endDate ?? '',
      location: rest.location ?? '',
      hours: rest.hours ?? 0,
      hourType,
      capacity: capacity ?? null,
      status: 'active',
      beneficiariesMen: rest.beneficiariesMen ?? 0,
      beneficiariesWomen: rest.beneficiariesWomen ?? 0,
      ods: ods.join(', '),
      committeeId: rest.committeeId || null,
    });

    // Crea los ActivityVolunteer para cada volunteerId (la "tablas de unión").
    if (volunteerIds.length > 0) {
      await Promise.all(
        volunteerIds.map((vid) =>
          this.fs.create<ActivityVolunteerDoc>('activityVolunteers', {
            activityId: created.id,
            volunteerId: vid,
            status: 'registered',
          }),
        ),
      );
    }

    // Embed committee + volunteers para preservar el shape del retorno de Prisma.
    const committee = created.committeeId
      ? await this.fs.findById<CommitteeDoc>('committees', created.committeeId)
      : null;
    const activityVolunteers = await this.fs.findAll<ActivityVolunteerDoc>('activityVolunteers', {
      where: { activityId: created.id },
    });
    const volunteers = await Promise.all(
      activityVolunteers.map(async (av) => {
        const volunteer = av.volunteerId
          ? await this.fs.findById<VolunteerDoc>('volunteers', av.volunteerId)
          : null;
        return { ...av, volunteer };
      }),
    );
    const createdWithIncludes = { ...created, committee, volunteers };

    const assignedVolunteers = volunteers
      .map((av) => av.volunteer)
      .filter((v): v is VolunteerDoc => !!v);

    // Caso 4: "Al crear una nueva actividad" — notificar a TODOS los voluntarios.
    void this.notifications.notifyAllVolunteers({
      type: 'activity',
      title: `Nueva actividad disponible: ${created.title}`,
      message: `Se creó la actividad "${created.title}"${created.startDate ? ` para el ${created.startDate}` : ''}${
        created.location ? ` en ${created.location}` : ''
      }${capacity ? ` · Cupo: ${capacity} personas` : ''}. Inscríbete desde la sección Actividades.`,
      link: '/actividades',
      metadata: { activityId: created.id, title: created.title, capacity: capacity ?? null },
    });

    // A los asignados directamente se les notifica aparte con otro mensaje.
    void this.notifications.createMany(
      assignedVolunteers.map((v) => ({
        userId: v.id,
        type: 'activity' as const,
        title: `Has sido asignado a: ${created.title}`,
        message: `Te inscribieron directamente en la actividad "${created.title}"${
          created.startDate ? ` para el ${created.startDate}` : ''
        }.`,
        link: '/actividades',
        metadata: { activityId: created.id, title: created.title, assigned: true },
      })),
    );

    void this.notifications.notifyAdmins({
      type: 'activity',
      title: `Nueva actividad creada: ${created.title}`,
      message: `Actividad "${created.title}"${
        committee ? ` (${committee.name})` : ''
      } con ${assignedVolunteers.length} voluntario(s) asignado(s) y capacidad ${
        capacity ?? 'ilimitada'
      }.`,
      link: '/actividades',
      metadata: { activityId: created.id },
    });

    // Notificación realtime: refrescar dashboard y lista de actividades.
    void realtime.emit(REALTIME_EVENTS.ACTIVITY_CREATED, {
      activityId: created.id,
      title: created.title,
    });
    void realtime.refreshDashboard({ reason: 'activity:created' });

    return this.serialize(createdWithIncludes);
  }

  async update(id: string, input: UpdateActivityInput) {
    const { volunteerIds, ods, capacity, hourType, ...rest } = input;
    if (ods) rest.ods = ods.join(', ');
    if (capacity !== undefined) rest.capacity = capacity ?? null;
    if (hourType !== undefined) rest.hourType = hourType as 'admin' | 'field';
    if (rest.committeeId !== undefined) rest.committeeId = rest.committeeId || null;

    if (volunteerIds) {
      await this.fs.deleteMany('activityVolunteers', { where: { activityId: id } });
      if (volunteerIds.length > 0) {
        await Promise.all(
          volunteerIds.map((vid) =>
            this.fs.create<ActivityVolunteerDoc>('activityVolunteers', {
              activityId: id,
              volunteerId: vid,
              status: 'registered',
            }),
          ),
        );
      }
    }

    const data: Record<string, unknown> = { ...rest };
    // Firestore no acepta `undefined` en los payloads — limpiar.
    Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);

    await this.fs.update<ActivityDoc>('activities', id, data);

    const updated = await this.fs.findById<ActivityDoc>('activities', id);
    const committee = updated?.committeeId
      ? await this.fs.findById<CommitteeDoc>('committees', updated.committeeId)
      : null;
    const activityVolunteers = await this.fs.findAll<ActivityVolunteerDoc>('activityVolunteers', {
      where: { activityId: id },
    });
    const volunteers = await Promise.all(
      activityVolunteers.map(async (av) => {
        const volunteer = av.volunteerId
          ? await this.fs.findById<VolunteerDoc>('volunteers', av.volunteerId)
          : null;
        return { ...av, volunteer };
      }),
    );
    const updatedWithIncludes = { ...updated, committee, volunteers };

    void realtime.emit(REALTIME_EVENTS.ACTIVITY_UPDATED, {
      activityId: id,
    });
    void realtime.refreshDashboard({ reason: 'activity:updated' });
    return this.serialize(updatedWithIncludes);
  }

  async remove(id: string) {
    // Firestore no tiene FK cascade: limpiamos manualmente las relaciones.
    // - activityVolunteers: onDelete: Cascade → borrar
    // - socialHours.activity / expenses.activity / hourRequests.activity: onDelete: SetNull → desreferenciar
    await Promise.all([
      this.fs.deleteMany('activityVolunteers', { where: { activityId: id } }),
      this.fs.updateMany('socialHours', { where: { activityId: id } }, { activityId: null }),
      this.fs.updateMany('expenses', { where: { activityId: id } }, { activityId: null }),
      this.fs.updateMany('hourRequests', { where: { activityId: id } }, { activityId: null }),
    ]);
    await this.fs.remove('activities', id);
    void realtime.emit(REALTIME_EVENTS.ACTIVITY_DELETED, { activityId: id });
    void realtime.refreshDashboard({ reason: 'activity:deleted' });
    return { success: true };
  }

  /** Devuelve el conteo de inscritos confirmados (no en lista de espera ni cancelados). */
  async getRegisteredCount(activityId: string): Promise<number> {
    return this.fs.count('activityVolunteers', {
      where: { activityId, status: 'registered' },
    });
  }

  /**
   * Inscribe a un voluntario en una actividad.
   * Respeta el cupo: si hay capacidad y está llena, devuelve `waitlist`.
   * Si el voluntario ya está inscrito, no hace nada (idempotente).
   * No permite inscripciones si la actividad ya fue completada.
   */
  async subscribe(activityId: string, volunteerId: string): Promise<SubscribeResult> {
    const activity = await this.fs.findById<ActivityDoc>('activities', activityId);
    if (!activity) {
      return {
        success: false,
        message: 'Actividad no encontrada',
        status: 'cancelled',
        activityId,
        volunteerId,
        registeredCount: 0,
        capacity: null,
        available: null,
      };
    }

    if (activity.status === 'completed') {
      return {
        success: false,
        message: 'Esta actividad ya fue finalizada y no admite inscripciones',
        status: 'cancelled',
        activityId,
        volunteerId,
        registeredCount: await this.getRegisteredCount(activityId),
        capacity: activity.capacity,
        available: 0,
      };
    }

    // ¿Ya está inscrito? (lookup por compound key activityId+volunteerId)
    const existing = await this.fs.findOne<ActivityVolunteerDoc>('activityVolunteers', {
      activityId,
      volunteerId,
    });
    if (existing && existing.status === 'registered') {
      const count = await this.getRegisteredCount(activityId);
      return {
        success: true,
        message: 'Ya estabas inscrito en esta actividad',
        status: 'already',
        activityId,
        volunteerId,
        registeredCount: count,
        capacity: activity.capacity,
        available: activity.capacity ? Math.max(0, activity.capacity - count) : null,
      };
    }

    const count = await this.getRegisteredCount(activityId);
    const isFull = activity.capacity !== null && count >= activity.capacity;
    const status: 'registered' | 'waitlist' = isFull ? 'waitlist' : 'registered';

    if (existing) {
      // Re-activar inscripción previa (cancelada o en espera)
      await this.fs.update<ActivityVolunteerDoc>('activityVolunteers', existing.id, { status });
    } else {
      await this.fs.create<ActivityVolunteerDoc>('activityVolunteers', {
        activityId,
        volunteerId,
        status,
      });
    }

    // Caso 2: "Subscripción a una actividad" — notificar al voluntario.
    const volunteerDoc = await this.fs.findById<VolunteerDoc>('volunteers', volunteerId);
    const volunteer = volunteerDoc
      ? { name: volunteerDoc.name, email: volunteerDoc.email }
      : null;
    if (volunteer) {
      void this.notifications.create({
        userId: volunteerId,
        type: 'activity',
        title: isFull
          ? `Estás en lista de espera: ${activity.title}`
          : `Inscripción confirmada: ${activity.title}`,
        message: isFull
          ? `La actividad "${activity.title}" alcanzó su cupo máximo (${activity.capacity} personas). Te agregamos a la lista de espera; te avisaremos si se libera un espacio.`
          : `Te inscribiste en la actividad "${activity.title}"${
              activity.startDate ? ` para el ${activity.startDate}` : ''
            }${activity.location ? ` · Lugar: ${activity.location}` : ''}. ¡Gracias por participar!`,
        link: '/actividades',
        metadata: {
          activityId,
          title: activity.title,
          status,
          capacity: activity.capacity,
          registeredCount: count + (isFull ? 0 : 1),
        },
      });
    }

    // Notificar a los admins para que estén al tanto.
    void this.notifications.notifyAdmins({
      type: 'activity',
      title: isFull
        ? `${volunteer?.name ?? 'Un voluntario'} se unió a la lista de espera de "${activity.title}"`
        : `${volunteer?.name ?? 'Un voluntario'} se inscribió en "${activity.title}"`,
      message: isFull
        ? `La actividad "${activity.title}" está llena (${activity.capacity}/${activity.capacity}). ${volunteer?.name ?? ''} fue agregado a la lista de espera.`
        : `${volunteer?.name ?? ''} se inscribió en "${activity.title}". Cupo: ${count + 1}${
            activity.capacity ? `/${activity.capacity}` : ''
          }.`,
      link: '/actividades',
      metadata: { activityId, volunteerId, status },
    });

    // Realtime: avisar a todos que la inscripción cambió (refresca cupos).
    void realtime.emit(REALTIME_EVENTS.ACTIVITY_SUBSCRIBED, {
      activityId,
      volunteerId,
      status,
    });
    void realtime.refreshDashboard({ reason: 'activity:subscribed' });

    return {
      success: true,
      message: isFull
        ? 'La actividad está llena. Te agregamos a la lista de espera.'
        : 'Inscripción confirmada exitosamente',
      status,
      activityId,
      volunteerId,
      registeredCount: count + (isFull ? 0 : 1),
      capacity: activity.capacity,
      available: activity.capacity
        ? Math.max(0, activity.capacity - count - (isFull ? 0 : 1))
        : null,
    };
  }

  /** Cancela la inscripción de un voluntario en una actividad. */
  async unsubscribe(activityId: string, volunteerId: string): Promise<SubscribeResult> {
    const activity = await this.fs.findById<ActivityDoc>('activities', activityId);
    if (!activity) {
      return {
        success: false,
        message: 'Actividad no encontrada',
        status: 'cancelled',
        activityId,
        volunteerId,
        registeredCount: 0,
        capacity: null,
        available: null,
      };
    }

    const existing = await this.fs.findOne<ActivityVolunteerDoc>('activityVolunteers', {
      activityId,
      volunteerId,
    });
    if (!existing || existing.status === 'cancelled') {
      const count = await this.getRegisteredCount(activityId);
      return {
        success: true,
        message: 'No estabas inscrito en esta actividad',
        status: 'cancelled',
        activityId,
        volunteerId,
        registeredCount: count,
        capacity: activity.capacity,
        available: activity.capacity ? Math.max(0, activity.capacity - count) : null,
      };
    }

    await this.fs.update<ActivityVolunteerDoc>('activityVolunteers', existing.id, {
      status: 'cancelled',
    });

    // Si había lista de espera y se libera un cupo, promocionar al primero en espera.
    if (activity.capacity && activity.status === 'active') {
      const waitlistResults = await this.fs.findAll<ActivityVolunteerDoc>('activityVolunteers', {
        where: { activityId, status: 'waitlist' },
        orderBy: { field: 'createdAt', direction: 'asc' },
        limit: 1,
      });
      const waitlist = waitlistResults[0] ?? null;
      if (waitlist) {
        await this.fs.update<ActivityVolunteerDoc>('activityVolunteers', waitlist.id, {
          status: 'registered',
        });
        // Notificar al voluntario promovido.
        void this.notifications.create({
          userId: waitlist.volunteerId,
          type: 'activity',
          title: `¡Cupo liberado en ${activity.title}!`,
          message: `Se liberó un espacio en la actividad "${activity.title}" y fuiste promovido desde la lista de espera. Tu inscripción está confirmada.`,
          link: '/actividades',
          metadata: { activityId, promoted: true },
        });
      }
    }

    const count = await this.getRegisteredCount(activityId);
    void realtime.emit(REALTIME_EVENTS.ACTIVITY_UNSUBSCRIBED, {
      activityId,
      volunteerId,
    });
    void realtime.refreshDashboard({ reason: 'activity:unsubscribed' });
    return {
      success: true,
      message: 'Cancelaste tu inscripción a la actividad',
      status: 'cancelled',
      activityId,
      volunteerId,
      registeredCount: count,
      capacity: activity.capacity,
      available: activity.capacity ? Math.max(0, activity.capacity - count) : null,
    };
  }

  /** Devuelve las actividades en las que un voluntario está inscrito. */
  async listForVolunteer(volunteerId: string) {
    const links = await this.fs.findAll<ActivityVolunteerDoc>('activityVolunteers', {
      where: { volunteerId, status: { op: 'in', value: ['registered', 'waitlist'] } },
      orderBy: { field: 'createdAt', direction: 'desc' },
    });
    return Promise.all(
      links.map(async (l) => {
        const activity = l.activityId
          ? await this.fs.findById<ActivityDoc>('activities', l.activityId)
          : null;
        let committee: CommitteeDoc | null = null;
        if (activity?.committeeId) {
          committee = await this.fs.findById<CommitteeDoc>('committees', activity.committeeId);
        }
        const activityWithCommittee = activity ? { ...activity, committee } : null;
        return {
          ...activityWithCommittee,
          ods: activity?.ods
            ? activity.ods
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : [],
          subscriptionStatus: l.status,
          subscribedAt: l.createdAt,
        };
      }),
    );
  }

  /**
   * Finaliza una actividad: la marca como `completed` y crea automáticamente
   * un registro de SocialHour (aprobado) para cada voluntario inscrito con
   * `status=registered`, asignándole las horas definidas en la actividad.
   * Las horas ya existentes para ese voluntario+actividad no se duplican.
   * Solo puede ejecutarlo un rol privilegiado (presidente/vice/líder/admin).
   */
  async complete(activityId: string, reviewerId: string): Promise<CompleteResult> {
    const activityDoc = await this.fs.findById<ActivityDoc>('activities', activityId);
    if (!activityDoc) {
      return {
        success: false,
        message: 'Actividad no encontrada',
        activityId,
        title: '',
        hoursPerVolunteer: 0,
        hourType: 'field',
        assignedCount: 0,
        skipped: [],
        alreadyCompleted: false,
      };
    }

    if (activityDoc.status === 'completed') {
      return {
        success: false,
        message: 'La actividad ya fue finalizada anteriormente',
        activityId,
        title: activityDoc.title,
        hoursPerVolunteer: activityDoc.hours,
        hourType: activityDoc.hourType,
        assignedCount: 0,
        skipped: [],
        alreadyCompleted: true,
      };
    }

    const activityVolunteers = await this.fs.findAll<ActivityVolunteerDoc>('activityVolunteers', {
      where: { activityId },
    });
    const avsWithVolunteer = await Promise.all(
      activityVolunteers.map(async (av) => {
        const volunteer = av.volunteerId
          ? await this.fs.findById<VolunteerDoc>('volunteers', av.volunteerId)
          : null;
        return { ...av, volunteer };
      }),
    );
    const activity = { ...activityDoc, volunteers: avsWithVolunteer };

    const registered = avsWithVolunteer.filter((av) => av.status === 'registered');
    const skipped: { volunteerId: string; reason: string }[] = [];
    const assigned: { volunteerId: string; volunteerName: string; hours: number }[] = [];

    // Horas a asignar (mínimo 0)
    const hoursToAssign = Math.max(0, activity.hours);
    const hourType = activity.hourType;

    // Verificar si ya existen horas creadas para esta actividad y no duplicar.
    const existingHours = await this.fs.findAll<SocialHourDoc>('socialHours', {
      where: { activityId },
    });
    const existingSet = new Set(existingHours.map((h) => h.volunteerId));

    for (const av of registered) {
      if (existingSet.has(av.volunteerId)) {
        skipped.push({
          volunteerId: av.volunteerId,
          reason: 'Ya tenía horas registradas para esta actividad',
        });
        continue;
      }
      if (hoursToAssign <= 0) {
        skipped.push({
          volunteerId: av.volunteerId,
          reason: 'La actividad define 0 horas',
        });
        continue;
      }
      await this.fs.create<SocialHourDoc>('socialHours', {
        volunteerId: av.volunteerId,
        activityId: activity.id,
        hours: hoursToAssign,
        type: hourType,
        date: new Date().toISOString().slice(0, 10),
        notes: `Horas asignadas automáticamente al finalizar la actividad "${activity.title}"`,
        approvalStatus: 'approved',
        reviewerId,
        reviewedAt: new Date().toISOString(),
      });
      assigned.push({
        volunteerId: av.volunteerId,
        volunteerName: av.volunteer?.name ?? 'Voluntario',
        hours: hoursToAssign,
      });
    }

    // Marcar la actividad como completada
    await this.fs.update<ActivityDoc>('activities', activityId, {
      status: 'completed',
      completedAt: new Date().toISOString(),
    });

    // Notificar a cada voluntario con horas asignadas
    void this.notifications.createMany(
      assigned.map((a) => ({
        userId: a.volunteerId,
        type: 'social_hour' as const,
        title: `+${a.hours}h aprobadas · ${activity.title}`,
        message: `Se finalizó la actividad "${activity.title}" y se te asignaron ${a.hours} hora(s) social(es) de tipo ${
          hourType === 'admin' ? 'administrativa' : 'de campo'
        }. Revisa tu perfil para ver tu total acumulado.`,
        link: '/perfil',
        metadata: {
          activityId,
          hours: a.hours,
          hourType,
          approved: true,
          autoAssigned: true,
        },
      })),
    );

    // Notificar a los admins
    void this.notifications.notifyAdmins({
      type: 'activity',
      title: `Actividad finalizada: ${activity.title}`,
      message: `Se finalizó la actividad "${activity.title}". Se asignaron ${hoursToAssign}h de tipo ${
        hourType === 'admin' ? 'administrativa' : 'de campo'
      } a ${assigned.length} voluntario(s) inscrito(s).${
        skipped.length > 0 ? ` ${skipped.length} omitido(s).` : ''
      }`,
      link: '/actividades',
      metadata: { activityId, assignedCount: assigned.length, hoursPerVolunteer: hoursToAssign },
    });

    // Evaluar logros automáticos de cada voluntario (horas, actividades, etc.).
    for (const a of assigned) {
      void this.achievements
        .evaluateAutoForVolunteer(a.volunteerId)
        .catch((err) =>
          console.warn('[activities] Error al evaluar logros tras finalizar actividad:', err),
        );
    }

    return {
      success: true,
      message: `Actividad finalizada. Se asignaron ${hoursToAssign}h a ${assigned.length} voluntario(s).`,
      activityId,
      title: activity.title,
      hoursPerVolunteer: hoursToAssign,
      hourType,
      assignedCount: assigned.length,
      skipped,
      alreadyCompleted: false,
    };
  }

  private serialize(a: any) {
    const registeredCount = (a.volunteers || []).filter(
      (av: any) => av.status === 'registered',
    ).length;
    return {
      ...a,
      ods: a.ods ? a.ods.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
      volunteers: (a.volunteers || []).map((av: any) => ({ ...av.volunteer, subscriptionStatus: av.status })),
      registeredCount,
      available: a.capacity ? Math.max(0, a.capacity - registeredCount) : null,
      capacityFull: a.capacity !== null && a.capacity !== undefined && registeredCount >= a.capacity,
    };
  }
}
