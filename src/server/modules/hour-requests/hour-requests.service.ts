/**
 * Hour Requests Service — solicitudes de horas adicionales hechas por
 * voluntarios, con aprobación/rechazo por líderes/presidente/vice/admin.
 *
 * Migrado de Prisma a Firestore. Los `include` de Prisma se reemplazan por
 * lookups manuales encadenados (Firestore no tiene JOINs nativos).
 *
 * El include `volunteer + activity + reviewer` (3-way join) se resuelve con
 * 3 lookups paralelos por registro. La aprobación crea un SocialHourDoc
 * adicional (aprobado directamente) — patrón preservado de la versión Prisma.
 */
import { inject, Injectable } from '@/server/core/container';
import { FIRESTORE_TOKEN, type FirestoreService } from '@/server/core/firestore.provider';
import { NotificationsService } from '@/server/modules/notifications/notifications.service';
import { AchievementsService } from '@/server/modules/achievements/achievements.service';
import type { CreateHourRequestInput, ReviewHourRequestInput } from './dto/hour-requests.dto';

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

interface HourRequestDoc {
  id: string;
  volunteerId: string;
  activityId: string | null;
  currentHours: number;
  requestedHours: number;
  approvedHours: number | null;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewerId: string | null;
  reviewNotes: string;
  reviewedAt: string | null;
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
export class HourRequestsService {
  private readonly fs = inject<FirestoreService>(FIRESTORE_TOKEN);
  private readonly notifications = inject(NotificationsService);
  private readonly achievements = inject(AchievementsService);

  /**
   * Adjeta `volunteer`, `activity` y `reviewer` (3-way join manual).
   * `reviewer` es una self-FK a Volunteer (puede ser null si la solicitud
   * no ha sido revisada o el reviewer fue eliminado).
   */
  private async enrichRequest(r: HourRequestDoc, includeVolunteer = true) {
    const [volunteer, activity, reviewer] = await Promise.all([
      includeVolunteer && r.volunteerId
        ? this.fs.findById<VolunteerDoc>('volunteers', r.volunteerId)
        : Promise.resolve(null),
      r.activityId
        ? this.fs.findById<ActivityDoc>('activities', r.activityId)
        : Promise.resolve(null),
      r.reviewerId
        ? this.fs.findById<VolunteerDoc>('volunteers', r.reviewerId)
        : Promise.resolve(null),
    ]);
    return { ...r, volunteer, activity, reviewer };
  }

  /** Lista todas las solicitudes (para líderes/presidente/vice/admin). */
  async list(filters: { status?: string } = {}) {
    const where: Record<string, unknown> = {};
    if (filters.status) where.status = filters.status;
    const requests = await this.fs.findAll<HourRequestDoc>('hourRequests', {
      where,
      orderBy: { field: 'createdAt', direction: 'desc' },
    });
    return Promise.all(requests.map((r) => this.enrichRequest(r, true)));
  }

  /** Lista las solicitudes del propio voluntario (sin volunteer embebido). */
  async listMine(volunteerId: string) {
    const requests = await this.fs.findAll<HourRequestDoc>('hourRequests', {
      where: { volunteerId },
      orderBy: { field: 'createdAt', direction: 'desc' },
    });
    // El endpoint /mine no incluye volunteer (es el propio usuario), pero
    // preservamos el shape de Prisma que sí tenía activity + reviewer.
    return Promise.all(requests.map((r) => this.enrichRequest(r, false)));
  }

  /** Crea una nueva solicitud de horas adicionales hecha por un voluntario. */
  async create(input: CreateHourRequestInput, volunteerId: string) {
    const created = await this.fs.create<HourRequestDoc>('hourRequests', {
      volunteerId,
      activityId: input.activityId || null,
      currentHours: input.currentHours,
      requestedHours: input.requestedHours,
      reason: input.reason,
      status: 'pending',
      reviewerId: null,
      reviewNotes: '',
      reviewedAt: null,
      approvedHours: null,
    });

    // Lookup volunteer + activity para preservar el return shape de Prisma
    // (`include: { volunteer: true, activity: true }`).
    const [volunteer, activity] = await Promise.all([
      this.fs.findById<VolunteerDoc>('volunteers', volunteerId),
      created.activityId
        ? this.fs.findById<ActivityDoc>('activities', created.activityId)
        : Promise.resolve(null),
    ]);

    // Notificar al voluntario que su solicitud fue recibida.
    void this.notifications.create({
      userId: volunteerId,
      type: 'hour_request',
      title: 'Solicitud de horas enviada',
      message: `Tu solicitud de +${input.requestedHours}h${
        activity ? ` en "${activity.title}"` : ''
      } fue enviada. Queda pendiente de revisión por un líder/presidente/vice.`,
      link: '/solicitudes-horas',
      metadata: { hourRequestId: created.id, requestedHours: input.requestedHours },
    });

    // Notificar a los aprobadores.
    void this.notifications.notifyAdmins({
      type: 'hour_request',
      title: 'Nueva solicitud de horas adicionales',
      message: `${volunteer?.name ?? 'Un voluntario'} solicita +${input.requestedHours}h${
        activity ? ` en "${activity.title}"` : ''
      }. Motivo: ${input.reason}`,
      link: '/solicitudes-horas',
      metadata: { hourRequestId: created.id, volunteerId, requestedHours: input.requestedHours },
    });

    return { ...created, volunteer, activity };
  }

  /** Aprueba la solicitud: crea la hora social adicional y marca la solicitud como aprobada. */
  async approve(id: string, reviewerId: string, approvedHours?: number) {
    const req = await this.fs.findById<HourRequestDoc>('hourRequests', id);
    if (!req) throw new Error('Solicitud no encontrada');
    if (req.status !== 'pending') throw new Error('La solicitud ya fue revisada');

    // Snapshot de volunteer + activity para notificaciones + return shape.
    const [volunteer, activity] = await Promise.all([
      this.fs.findById<VolunteerDoc>('volunteers', req.volunteerId),
      req.activityId
        ? this.fs.findById<ActivityDoc>('activities', req.activityId)
        : Promise.resolve(null),
    ]);

    const finalHours = approvedHours ?? req.requestedHours;

    // Crear la hora social adicional, aprobada directamente (la aprueba el reviewer).
    const newHour = await this.fs.create<SocialHourDoc>('socialHours', {
      volunteerId: req.volunteerId,
      activityId: req.activityId || null,
      hours: finalHours,
      type: 'field',
      date: new Date().toISOString().slice(0, 10),
      notes: `Hora adicional aprobada por solicitud. Motivo: ${req.reason}`,
      approvalStatus: 'approved',
      reviewerId,
      reviewedAt: new Date().toISOString(),
    });

    await this.fs.update<HourRequestDoc>('hourRequests', id, {
      status: 'approved',
      approvedHours: finalHours,
      reviewerId,
      reviewNotes: '',
      reviewedAt: new Date().toISOString(),
    });

    const updated = await this.fs.findById<HourRequestDoc>('hourRequests', id);
    if (!updated) throw new Error('Solicitud no encontrada tras actualizar');
    const reviewer = await this.fs.findById<VolunteerDoc>('volunteers', reviewerId);
    const enriched = { ...updated, volunteer, activity, reviewer };

    // Notificar al voluntario.
    void this.notifications.create({
      userId: req.volunteerId,
      type: 'hour_request',
      title: `¡Solicitud aprobada! +${finalHours}h`,
      message: `Tu solicitud de ${req.requestedHours}h${
        activity ? ` en "${activity.title}"` : ''
      } fue aprobada${
        finalHours !== req.requestedHours ? ` (se ajustó a ${finalHours}h)` : ''
      }. Las horas ya están en tu registro.`,
      link: '/perfil',
      metadata: { hourRequestId: id, approvedHours: finalHours, socialHourId: newHour.id },
    });

    // Evaluar logros automáticos (puede haber desbloqueado nuevos).
    void this.achievements
      .evaluateAutoForVolunteer(req.volunteerId)
      .catch((err) =>
        console.warn('[hour-requests] Error al evaluar logros tras aprobar solicitud:', err),
      );

    return enriched;
  }

  /** Rechaza la solicitud. */
  async reject(id: string, reviewerId: string, notes: string = '') {
    const req = await this.fs.findById<HourRequestDoc>('hourRequests', id);
    if (!req) throw new Error('Solicitud no encontrada');
    if (req.status !== 'pending') throw new Error('La solicitud ya fue revisada');

    const [volunteer, activity] = await Promise.all([
      this.fs.findById<VolunteerDoc>('volunteers', req.volunteerId),
      req.activityId
        ? this.fs.findById<ActivityDoc>('activities', req.activityId)
        : Promise.resolve(null),
    ]);

    await this.fs.update<HourRequestDoc>('hourRequests', id, {
      status: 'rejected',
      reviewerId,
      reviewNotes: notes,
      reviewedAt: new Date().toISOString(),
    });

    const updated = await this.fs.findById<HourRequestDoc>('hourRequests', id);
    if (!updated) throw new Error('Solicitud no encontrada tras actualizar');
    const reviewer = await this.fs.findById<VolunteerDoc>('volunteers', reviewerId);
    const enriched = { ...updated, volunteer, activity, reviewer };

    void this.notifications.create({
      userId: req.volunteerId,
      type: 'hour_request',
      title: 'Solicitud no aprobada',
      message: `Tu solicitud de +${req.requestedHours}h${
        activity ? ` en "${activity.title}"` : ''
      } no fue aprobada.${notes ? ` Motivo: ${notes}` : ''}`,
      link: '/solicitudes-horas',
      metadata: { hourRequestId: id, rejected: true, reason: notes },
    });

    return enriched;
  }

  async remove(id: string) {
    await this.fs.remove('hourRequests', id);
    return { success: true };
  }
}
