import { inject, Injectable } from '@/server/core/container';
import { PRISMA_TOKEN } from '@/server/core/prisma.provider';
import { NotificationsService } from '@/server/modules/notifications/notifications.service';
import { AchievementsService } from '@/server/modules/achievements/achievements.service';
import type { CreateClassInput, UpdateClassInput } from './dto/classes.dto';

/** Resultado de finalizar una clase. */
export interface CompleteClassResult {
  success: boolean;
  message: string;
  classId: string;
  title: string;
  hoursPerInstructor: number;
  assignedCount: number;
  skipped: { volunteerId: string; reason: string }[];
  alreadyCompleted: boolean;
}

@Injectable()
export class ClassesService {
  private readonly db = inject<typeof import('@prisma/client').PrismaClient>(PRISMA_TOKEN);
  private readonly notifications = inject(NotificationsService);
  private readonly achievements = inject(AchievementsService);

  async list() {
    const items = await this.db.class.findMany({
      include: {
        committee: true,
        instructors: { include: { volunteer: true } },
      },
      orderBy: { date: 'desc' },
    });
    return items.map((c) => ({
      ...c,
      instructors: c.instructors.map((ci) => ({ ...ci.volunteer, role: ci.role })),
    }));
  }

  async getById(id: string) {
    const c = await this.db.class.findUnique({
      where: { id },
      include: { committee: true, instructors: { include: { volunteer: true } } },
    });
    if (!c) return null;
    return {
      ...c,
      instructors: c.instructors.map((ci) => ({ ...ci.volunteer, role: ci.role })),
    };
  }

  async create(input: CreateClassInput) {
    const { instructorIds = [], ...rest } = input;
    const created = await this.db.class.create({
      data: {
        title: rest.title,
        date: rest.date ?? '',
        durationHours: rest.durationHours ?? 1,
        school: rest.school ?? '',
        topic: rest.topic ?? '',
        description: rest.description ?? '',
        committeeId: rest.committeeId || null,
        instructors:
          instructorIds.length > 0
            ? { create: instructorIds.map((volunteerId) => ({ volunteerId })) }
            : undefined,
      },
      include: { committee: true, instructors: { include: { volunteer: true } } },
    });

    const instructors = created.instructors.map((ci) => ci.volunteer);

    // Caso 6: "Cuando se cree una nueva clase" — notificar a los instructores asignados.
    void this.notifications.createMany(
      instructors.map((v) => ({
        userId: v.id,
        type: 'class' as const,
        title: `Nueva clase asignada: ${created.title}`,
        message: `Has sido asignado(a) como instructor(a) de la clase "${created.title}"${
          created.date ? ` para el ${created.date}` : ''
        }${created.school ? ` en ${created.school}` : ''}${created.durationHours ? ` · Duración: ${created.durationHours}h` : ''}.`,
        link: '/clases',
        metadata: { classId: created.id, title: created.title, role: 'instructor' },
      })),
    );

    // Notificar a los admins.
    void this.notifications.notifyAdmins({
      type: 'class',
      title: `Nueva clase creada: ${created.title}`,
      message: `Se creó la clase "${created.title}"${created.committee ? ` (${created.committee.name})` : ''}${created.school ? ` en ${created.school}` : ''} con ${instructors.length} instructor(es).`,
      link: '/clases',
      metadata: { classId: created.id },
    });

    // Notificar a miembros del comité si la clase tiene comité asignado.
    void this.notifications.notifyCommitteeMembers(created.committeeId, {
      type: 'class',
      title: `Nueva clase en tu comité: ${created.title}`,
      message: `Se programó la clase "${created.title}"${created.date ? ` para el ${created.date}` : ''} en tu comité.`,
      link: '/clases',
      metadata: { classId: created.id },
    });

    return {
      ...created,
      instructors: created.instructors.map((ci) => ({ ...ci.volunteer, role: ci.role })),
    };
  }

  async update(id: string, input: UpdateClassInput) {
    const { instructorIds, ...rest } = input;
    if (rest.committeeId !== undefined) rest.committeeId = (rest.committeeId || null) as any;

    if (instructorIds) {
      await this.db.classVolunteer.deleteMany({ where: { classId: id } });
      if (instructorIds.length > 0) {
        await this.db.classVolunteer.createMany({
          data: instructorIds.map((volunteerId) => ({ classId: id, volunteerId })),
        });
      }
    }

    const updated = await this.db.class.update({
      where: { id },
      data: rest as any,
      include: { committee: true, instructors: { include: { volunteer: true } } },
    });
    return {
      ...updated,
      instructors: updated.instructors.map((ci) => ({ ...ci.volunteer, role: ci.role })),
    };
  }

  async remove(id: string) {
    await this.db.class.delete({ where: { id } });
    return { success: true };
  }

  /**
   * Finaliza una clase: la marca como `completed` y crea automáticamente
   * un registro de SocialHour (aprobado) para cada instructor con las horas
   * definidas en la clase (durationHours). Las horas ya existentes para
   * ese instructor+clase no se duplican.
   * Solo puede ejecutarlo un rol privilegiado (presidente/vice/líder/admin).
   *
   * Como las clases no tienen una actividad asociada directamente, las horas
   * se crean sin activityId (solo con notes mencionando la clase).
   */
  async complete(classId: string, reviewerId: string): Promise<CompleteClassResult> {
    const cls = await this.db.class.findUnique({
      where: { id: classId },
      include: { instructors: { include: { volunteer: true } } },
    });
    if (!cls) {
      return {
        success: false,
        message: 'Clase no encontrada',
        classId,
        title: '',
        hoursPerInstructor: 0,
        assignedCount: 0,
        skipped: [],
        alreadyCompleted: false,
      };
    }

    if (cls.status === 'completed') {
      return {
        success: false,
        message: 'La clase ya fue finalizada anteriormente',
        classId,
        title: cls.title,
        hoursPerInstructor: cls.durationHours,
        assignedCount: 0,
        skipped: [],
        alreadyCompleted: true,
      };
    }

    const hoursToAssign = Math.max(0, cls.durationHours);
    const assigned: { volunteerId: string; volunteerName: string; hours: number }[] = [];
    const skipped: { volunteerId: string; reason: string }[] = [];

    // Para clases no hay un Activity al que asociar las horas; las creamos sueltas
    // (activityId = null) con notas que mencionan la clase.
    if (hoursToAssign <= 0) {
      for (const ci of cls.instructors) {
        skipped.push({
          volunteerId: ci.volunteerId,
          reason: 'La clase define 0 horas',
        });
      }
    } else {
      for (const ci of cls.instructors) {
        // Evitar duplicados: si el instructor ya tiene una hora con la misma
        // nota+mismo día, no la volvemos a crear. Esto es heurístico porque
        // no hay forma directa de "asociar" horas a una clase.
        const noteMarker = `[clase:${cls.id}]`;
        const existing = await this.db.socialHour.findFirst({
          where: {
            volunteerId: ci.volunteerId,
            notes: { contains: noteMarker },
          },
        });
        if (existing) {
          skipped.push({
            volunteerId: ci.volunteerId,
            reason: 'Ya tenía horas registradas para esta clase',
          });
          continue;
        }

        await this.db.socialHour.create({
          data: {
            volunteerId: ci.volunteerId,
            activityId: null,
            hours: hoursToAssign,
            type: 'field', // las clases siempre cuentan como horas de campo
            date: cls.date || new Date().toISOString().slice(0, 10),
            notes: `${noteMarker} Horas asignadas automáticamente al finalizar la clase "${cls.title}"${cls.school ? ` en ${cls.school}` : ''}.`,
            approvalStatus: 'approved',
            reviewerId,
            reviewedAt: new Date(),
          },
        });
        assigned.push({
          volunteerId: ci.volunteerId,
          volunteerName: ci.volunteer.name,
          hours: hoursToAssign,
        });
      }
    }

    // Marcar la clase como completada
    await this.db.class.update({
      where: { id: classId },
      data: { status: 'completed', completedAt: new Date() },
    });

    // Notificar a cada instructor con horas asignadas
    void this.notifications.createMany(
      assigned.map((a) => ({
        userId: a.volunteerId,
        type: 'social_hour' as const,
        title: `+${a.hours}h aprobadas · Clase: ${cls.title}`,
        message: `Se finalizó la clase "${cls.title}"${cls.school ? ` en ${cls.school}` : ''} y se te asignaron ${a.hours} hora(s) social(es) de tipo de campo. Revisa tu perfil para ver tu total acumulado.`,
        link: '/perfil',
        metadata: {
          classId,
          hours: a.hours,
          hourType: 'field',
          approved: true,
          autoAssigned: true,
        },
      })),
    );

    // Notificar a los admins
    void this.notifications.notifyAdmins({
      type: 'class',
      title: `Clase finalizada: ${cls.title}`,
      message: `Se finalizó la clase "${cls.title}". Se asignaron ${hoursToAssign}h de campo a ${assigned.length} instructor(es).${skipped.length > 0 ? ` ${skipped.length} omitido(s).` : ''}`,
      link: '/clases',
      metadata: { classId, assignedCount: assigned.length, hoursPerInstructor: hoursToAssign },
    });

    // Evaluar logros automáticos de cada instructor (horas, clases, etc.).
    for (const a of assigned) {
      void this.achievements
        .evaluateAutoForVolunteer(a.volunteerId)
        .catch((err) =>
          console.warn('[classes] Error al evaluar logros tras finalizar clase:', err),
        );
    }

    return {
      success: true,
      message: `Clase finalizada. Se asignaron ${hoursToAssign}h a ${assigned.length} instructor(es).`,
      classId,
      title: cls.title,
      hoursPerInstructor: hoursToAssign,
      assignedCount: assigned.length,
      skipped,
      alreadyCompleted: false,
    };
  }
}
