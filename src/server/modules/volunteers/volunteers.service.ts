/**
 * Volunteers Service — gestión de voluntarios (CRUD) y agregación de horas.
 */
import bcrypt from 'bcryptjs';
import { inject, Injectable } from '@/server/core/container';
import { PRISMA_TOKEN } from '@/server/core/prisma.provider';
import { NotificationsService } from '@/server/modules/notifications/notifications.service';
import { realtime, REALTIME_EVENTS } from '@/lib/realtime-publisher';
import type { CreateVolunteerInput, UpdateVolunteerInput } from './dto/volunteers.dto';

@Injectable()
export class VolunteersService {
  private readonly db = inject<typeof import('@prisma/client').PrismaClient>(PRISMA_TOKEN);
  private readonly notifications = inject(NotificationsService);

  async list() {
    return this.db.volunteer.findMany({
      include: { committee: true },
      orderBy: { name: 'asc' },
    });
  }

  async getById(id: string) {
    return this.db.volunteer.findUnique({
      where: { id },
      include: {
        committee: true,
        socialHours: { include: { activity: true }, orderBy: { date: 'desc' } },
        activityLinks: { include: { activity: true } },
        classLinks: { include: { class: true } },
      },
    });
  }

  async getHours(id: string) {
    const hours = await this.db.socialHour.findMany({
      where: { volunteerId: id },
      include: { activity: true },
      orderBy: { date: 'desc' },
    });
    // Solo cuentan las horas aprobadas para los totales.
    const approvedHours = hours.filter((h) => h.approvalStatus === 'approved');
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
      pendingHours: hours
        .filter((h) => h.approvalStatus === 'pending')
        .reduce((s, h) => s + h.hours, 0),
      rejectedHours: hours
        .filter((h) => h.approvalStatus === 'rejected')
        .reduce((s, h) => s + h.hours, 0),
      records: hours,
      byActivity: Array.from(byActivity.entries()).map(([activityId, v]) => ({
        activityId,
        title: v.title,
        hours: v.hours,
        type: v.type,
      })),
    };
  }

  async create(input: CreateVolunteerInput) {
    const existing = await this.db.volunteer.findUnique({
      where: { studentId: input.studentId },
    });
    if (existing) throw new Error('Ya existe un voluntario con este carnet');

    const password = input.password ?? 'voluntario123';
    const hashed = await bcrypt.hash(password, 10);

    const { ...data } = input;
    const created = await this.db.volunteer.create({
      data: {
        name: data.name,
        studentId: data.studentId,
        career: data.career,
        committeeId: data.committeeId || null,
        role: data.role,
        email: data.email ?? '',
        phone: data.phone ?? '',
        password: hashed,
      },
      include: { committee: true },
    });

    // Notifica a los admins sobre el nuevo voluntario.
    void this.notifications.notifyAdmins({
      type: 'volunteer',
      title: `Nuevo voluntario: ${created.name}`,
      message: `Se registró a ${created.name} (carnet ${created.studentId})${created.committee ? ` en ${created.committee.name}` : ''}.`,
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

    return created;
  }

  async update(id: string, input: UpdateVolunteerInput) {
    // Snapshot previo para detectar cambios relevantes y notificar al usuario.
    const before = await this.db.volunteer.findUnique({ where: { id }, include: { committee: true } });
    if (!before) throw new Error('Voluntario no encontrado');

    const data: Record<string, unknown> = { ...input };
    if (input.password) {
      data.password = await bcrypt.hash(input.password, 10);
    }
    if (input.committeeId === null || input.committeeId === undefined) {
      // keep
    } else {
      data.committeeId = input.committeeId || null;
    }

    const updated = await this.db.volunteer.update({
      where: { id },
      data: data as any,
      include: { committee: true },
    });

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

    return updated;
  }

  async remove(id: string) {
    await this.db.volunteer.delete({ where: { id } });
    void realtime.emit(REALTIME_EVENTS.VOLUNTEER_DELETED, { volunteerId: id });
    void realtime.refreshDashboard({ reason: 'volunteer:deleted' });
    return { success: true };
  }
}
