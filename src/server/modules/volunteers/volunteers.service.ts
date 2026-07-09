/**
 * Volunteers Service — gestión de voluntarios (CRUD) y agregación de horas.
 *
 * Migrado de Prisma a Firestore. Los `include` de Prisma se reemplazan por
 * lookups manuales (Firestore no tiene JOINs nativos).
 */
import bcrypt from 'bcryptjs';
import { inject, Injectable } from '@/server/core/container';
import { FIRESTORE_TOKEN, type FirestoreService } from '@/server/core/firestore.provider';
import { NotificationsService } from '@/server/modules/notifications/notifications.service';
import { realtime, REALTIME_EVENTS } from '@/lib/realtime-publisher';
import type { CreateVolunteerInput, UpdateVolunteerInput } from './dto/volunteers.dto';

/** Tipo del voluntario tal como se almacena en Firestore. */
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

interface ActivityVolunteerDoc {
  id: string;
  activityId: string;
  volunteerId: string;
  status: 'registered' | 'waitlist' | 'cancelled';
  createdAt: string;
}

interface ClassVolunteerDoc {
  id: string;
  classId: string;
  volunteerId: string;
  role: 'instructor' | 'assistant';
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

@Injectable()
export class VolunteersService {
  private readonly fs = inject<FirestoreService>(FIRESTORE_TOKEN);
  private readonly notifications = inject(NotificationsService);

  async list() {
    const volunteers = await this.fs.findAll<VolunteerDoc>('volunteers', {
      orderBy: { field: 'name', direction: 'asc' },
    });
    return Promise.all(
      volunteers.map(async (v) => {
        let committee: CommitteeDoc | null = null;
        if (v.committeeId) {
          committee = await this.fs.findById<CommitteeDoc>('committees', v.committeeId);
        }
        return { ...v, committee };
      }),
    );
  }

  async getById(id: string) {
    const v = await this.fs.findById<VolunteerDoc>('volunteers', id);
    if (!v) return null;

    let committee: CommitteeDoc | null = null;
    if (v.committeeId) {
      committee = await this.fs.findById<CommitteeDoc>('committees', v.committeeId);
    }

    const [socialHours, activityLinks, classLinks] = await Promise.all([
      this.fs.findAll<SocialHourDoc>('socialHours', {
        where: { volunteerId: id },
        orderBy: { field: 'date', direction: 'desc' },
      }),
      this.fs.findAll<ActivityVolunteerDoc>('activityVolunteers', {
        where: { volunteerId: id },
      }),
      this.fs.findAll<ClassVolunteerDoc>('classVolunteers', {
        where: { volunteerId: id },
      }),
    ]);

    const [socialHoursWithActivity, activityLinksWithActivity, classLinksWithClass] =
      await Promise.all([
        Promise.all(
          socialHours.map(async (h) => {
            let activity: ActivityDoc | null = null;
            if (h.activityId) {
              activity = await this.fs.findById<ActivityDoc>('activities', h.activityId);
            }
            return { ...h, activity };
          }),
        ),
        Promise.all(
          activityLinks.map(async (av) => {
            const activity = av.activityId
              ? await this.fs.findById<ActivityDoc>('activities', av.activityId)
              : null;
            return { ...av, activity };
          }),
        ),
        Promise.all(
          classLinks.map(async (cl) => {
            const cls = cl.classId
              ? await this.fs.findById<ClassDoc>('classes', cl.classId)
              : null;
            return { ...cl, class: cls };
          }),
        ),
      ]);

    return {
      ...v,
      committee,
      socialHours: socialHoursWithActivity,
      activityLinks: activityLinksWithActivity,
      classLinks: classLinksWithClass,
    };
  }

  async getHours(id: string) {
    const hours = await this.fs.findAll<SocialHourDoc>('socialHours', {
      where: { volunteerId: id },
      orderBy: { field: 'date', direction: 'desc' },
    });
    // Embed activity (para el reporte por actividad y para `records`).
    const hoursWithActivity = await Promise.all(
      hours.map(async (h) => {
        let activity: ActivityDoc | null = null;
        if (h.activityId) {
          activity = await this.fs.findById<ActivityDoc>('activities', h.activityId);
        }
        return { ...h, activity };
      }),
    );
    // Solo cuentan las horas aprobadas para los totales.
    const approvedHours = hoursWithActivity.filter((h) => h.approvalStatus === 'approved');
    const adminHours = approvedHours
      .filter((h) => h.type === 'admin')
      .reduce((s, h) => s + h.hours, 0);
    const fieldHours = approvedHours
      .filter((h) => h.type === 'field')
      .reduce((s, h) => s + h.hours, 0);
    const byActivity = new Map<string, { title: string; hours: number; type: string }>();
    for (const h of approvedHours) {
      const key = h.activityId ?? 'manual';
      const title = h.activity?.title ?? 'Registro manual';
      const prev = byActivity.get(key) ?? { title, hours: 0, type: h.type };
      prev.hours += h.hours;
      byActivity.set(key, prev);
    }
    return {
      totalHours: adminHours + fieldHours,
      adminHours,
      fieldHours,
      pendingHours: hoursWithActivity
        .filter((h) => h.approvalStatus === 'pending')
        .reduce((s, h) => s + h.hours, 0),
      rejectedHours: hoursWithActivity
        .filter((h) => h.approvalStatus === 'rejected')
        .reduce((s, h) => s + h.hours, 0),
      records: hoursWithActivity,
      byActivity: Array.from(byActivity.entries()).map(([activityId, val]) => ({
        activityId,
        title: val.title,
        hours: val.hours,
        type: val.type,
      })),
    };
  }

  async create(input: CreateVolunteerInput) {
    const existing = await this.fs.findOne<VolunteerDoc>('volunteers', {
      studentId: input.studentId,
    });
    if (existing) throw new Error('Ya existe un voluntario con este carnet');

    const password = input.password ?? 'voluntario123';
    const hashed = await bcrypt.hash(password, 10);

    const created = await this.fs.create<VolunteerDoc>('volunteers', {
      name: input.name,
      studentId: input.studentId,
      career: input.career,
      committeeId: input.committeeId || null,
      role: input.role,
      email: input.email ?? '',
      phone: input.phone ?? '',
      password: hashed,
    });

    // Embed committee para mantener el shape del retorno de Prisma.
    let committee: CommitteeDoc | null = null;
    if (created.committeeId) {
      committee = await this.fs.findById<CommitteeDoc>('committees', created.committeeId);
    }
    const createdWithCommittee = { ...created, committee };

    // Notifica a los admins sobre el nuevo voluntario.
    void this.notifications.notifyAdmins({
      type: 'volunteer',
      title: `Nuevo voluntario: ${created.name}`,
      message: `Se registró a ${created.name} (carnet ${created.studentId})${
        createdWithCommittee.committee ? ` en ${createdWithCommittee.committee.name}` : ''
      }.`,
      link: '/voluntarios',
      metadata: { volunteerId: created.id, name: created.name, studentId: created.studentId },
    });

    // Email de bienvenida al propio voluntario (Creación de cuenta).
    if (created.email) {
      void this.notifications.create({
        userId: created.id,
        type: 'volunteer',
        title: '¡Bienvenido(a) a EduTECH ESEN!',
        message: `Hola ${created.name}, tu cuenta ha sido creada exitosamente. Tu carnet es ${created.studentId}. Ya puedes inscribirte en actividades, registrar tus horas sociales y seguir tu progreso en la plataforma.`,
        link: '/dashboard',
        metadata: { welcome: true, studentId: created.studentId, role: created.role },
      });
    }

    // Realtime: refrescar dashboard (conteo de voluntarios, miembros por comité).
    void realtime.emit(REALTIME_EVENTS.VOLUNTEER_CREATED, {
      volunteerId: created.id,
      name: created.name,
    });
    void realtime.refreshDashboard({ reason: 'volunteer:created' });

    return createdWithCommittee;
  }

  async update(id: string, input: UpdateVolunteerInput) {
    // Snapshot previo para detectar cambios relevantes y notificar al usuario.
    const before = await this.fs.findById<VolunteerDoc>('volunteers', id);
    if (!before) throw new Error('Voluntario no encontrado');

    const data: Record<string, unknown> = { ...input };
    if (input.password) {
      data.password = await bcrypt.hash(input.password, 10);
    }
    if (input.committeeId === null || input.committeeId === undefined) {
      // keep — no actualizar el committeeId
      delete data.committeeId;
    } else {
      data.committeeId = input.committeeId || null;
    }
    // Firestore no acepta `undefined` en los payloads — limpiar.
    Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);

    await this.fs.update<VolunteerDoc>('volunteers', id, data);

    const updated = await this.fs.findById<VolunteerDoc>('volunteers', id);
    let committee: CommitteeDoc | null = null;
    if (updated?.committeeId) {
      committee = await this.fs.findById<CommitteeDoc>('committees', updated.committeeId);
    }
    const updatedWithCommittee = { ...updated, committee };

    // Caso: "Al modificar algo de su cuenta" — notificar al propio usuario.
    // Solo si cambió algo sustantivo (no notificamos cambios menores).
    const changes: string[] = [];
    if (input.name && input.name !== before.name) changes.push(`Nombre: ${before.name} → ${input.name}`);
    if (input.career && input.career !== before.career) changes.push(`Carrera actualizada`);
    if (input.email !== undefined && input.email !== before.email) changes.push(`Email actualizado`);
    if (input.phone !== undefined && input.phone !== before.phone) changes.push(`Teléfono actualizado`);
    if (input.committeeId !== undefined && input.committeeId !== before.committeeId) {
      changes.push(`Comité actualizado`);
    }
    if (input.role && input.role !== before.role) {
      const roleLabel: Record<string, string> = {
        admin: 'Administrador',
        volunteer: 'Voluntario',
        committee_leader: 'Líder de Comité',
        president: 'Presidente',
        vice_president: 'Vicepresidente',
      };
      changes.push(`Rol: ${roleLabel[before.role] ?? before.role} → ${roleLabel[input.role] ?? input.role}`);
    }
    if (input.password) changes.push('Contraseña actualizada');

    if (changes.length > 0) {
      const message = changes.length === 1
        ? `Se actualizó: ${changes[0]}.`
        : `Se actualizaron los siguientes datos:\n• ${changes.join('\n• ')}`;
      void this.notifications.create({
        userId: id,
        type: 'volunteer',
        title: 'Actualización de tu cuenta',
        message,
        link: '/perfil',
        metadata: { accountUpdate: true, fields: changes },
      });
    }

    // Realtime: refrescar dashboard + lista de voluntarios + perfil del usuario.
    void realtime.emit(REALTIME_EVENTS.VOLUNTEER_UPDATED, { volunteerId: id });
    void realtime.refreshDashboard({ reason: 'volunteer:updated' });
    void realtime.emitToUser(id, 'dashboard:refresh', { reason: 'own-profile-updated' });

    return updatedWithCommittee;
  }

  async remove(id: string) {
    // Firestore no tiene cascade como Prisma: limpiamos manualmente las relaciones
    // que en el schema Prisma eran onDelete: Cascade o SetNull.
    await Promise.all([
      this.fs.deleteMany('activityVolunteers', { where: { volunteerId: id } }),
      this.fs.deleteMany('classVolunteers', { where: { volunteerId: id } }),
      this.fs.deleteMany('socialHours', { where: { volunteerId: id } }),
      this.fs.deleteMany('notifications', { where: { userId: id } }),
      // SetNull: el voluntario era reviewer de horas/solicitudes; lo desreferenciamos.
      this.fs.updateMany('socialHours', { where: { reviewerId: id } }, { reviewerId: null }),
    ]);
    await this.fs.remove('volunteers', id);

    void realtime.emit(REALTIME_EVENTS.VOLUNTEER_DELETED, { volunteerId: id });
    void realtime.refreshDashboard({ reason: 'volunteer:deleted' });
    return { success: true };
  }
}
