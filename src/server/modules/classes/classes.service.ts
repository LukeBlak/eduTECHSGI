/**
 * Classes Service — gestión de clases (CRUD) + finalización con asignación
 * automática de horas sociales a los instructores.
 *
 * Migrado de Prisma a Firestore. Los `include` de Prisma se reemplazan por
 * lookups manuales (Firestore no tiene JOINs nativos).
 */
import { inject, Injectable } from '@/server/core/container';
import { FIRESTORE_TOKEN, type FirestoreService } from '@/server/core/firestore.provider';
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

interface CommitteeDoc {
  id: string;
  name: string;
  description: string;
  color: string;
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

interface ClassVolunteerDoc {
  id: string;
  classId: string;
  volunteerId: string;
  role: 'instructor' | 'assistant';
  createdAt: string;
}

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
export class ClassesService {
  private readonly fs = inject<FirestoreService>(FIRESTORE_TOKEN);
  private readonly notifications = inject(NotificationsService);
  private readonly achievements = inject(AchievementsService);

  /**
   * Adjeta `committee` (lookup) e `instructors` (lookup de ClassVolunteer → Volunteer).
   * Mantiene el shape del retorno de Prisma: `instructors: [{ ...volunteer, role }]`.
   */
  private async enrichClass(c: ClassDoc) {
    const [committee, classVolunteers] = await Promise.all([
      c.committeeId
        ? this.fs.findById<CommitteeDoc>('committees', c.committeeId)
        : Promise.resolve(null),
      this.fs.findAll<ClassVolunteerDoc>('classVolunteers', { where: { classId: c.id } }),
    ]);
    const instructorsRaw = await Promise.all(
      classVolunteers.map(async (ci) => {
        const volunteer = ci.volunteerId
          ? await this.fs.findById<VolunteerDoc>('volunteers', ci.volunteerId)
          : null;
        return { ci, volunteer };
      }),
    );
    // Mantiene el shape de Prisma: { ...volunteer, role }
    const instructors = instructorsRaw
      .filter((x) => x.volunteer !== null)
      .map((x) => ({ ...(x.volunteer as VolunteerDoc), role: x.ci.role }));
    return { ...c, committee, instructors };
  }

  async list() {
    const items = await this.fs.findAll<ClassDoc>('classes', {
      orderBy: { field: 'date', direction: 'desc' },
    });
    return Promise.all(items.map((c) => this.enrichClass(c)));
  }

  async getById(id: string) {
    const c = await this.fs.findById<ClassDoc>('classes', id);
    if (!c) return null;
    return this.enrichClass(c);
  }

  async create(input: CreateClassInput) {
    const { instructorIds = [], ...rest } = input;
    const created = await this.fs.create<ClassDoc>('classes', {
      title: rest.title,
      date: rest.date ?? '',
      durationHours: rest.durationHours ?? 1,
      school: rest.school ?? '',
      topic: rest.topic ?? '',
      description: rest.description ?? '',
      committeeId: rest.committeeId || null,
      status: 'active',
      completedAt: null,
    });

    // Bulk attach instructors: ClassVolunteer.createMany → Promise.all(create).
    if (instructorIds.length > 0) {
      await Promise.all(
        instructorIds.map((volunteerId) =>
          this.fs.create<ClassVolunteerDoc>('classVolunteers', {
            classId: created.id,
            volunteerId,
            role: 'instructor',
          }),
        ),
      );
    }

    const enriched = await this.enrichClass(created);
    const instructors = enriched.instructors;

    // Caso 6: "Cuando se cree una nueva clase" — notificar a los instructores asignados.
    void this.notifications.createMany(
      instructors.map((v) => ({
        userId: v.id,
        type: 'class' as const,
        title: `Nueva clase asignada: ${created.title}`,
        message: `Has sido asignado(a) como instructor(a) de la clase "${created.title}"${
          created.date ? ` para el ${created.date}` : ''
        }${created.school ? ` en ${created.school}` : ''}${
          created.durationHours ? ` · Duración: ${created.durationHours}h` : ''
        }.`,
        link: '/clases',
        metadata: { classId: created.id, title: created.title, role: 'instructor' },
      })),
    );

    // Notificar a los admins.
    void this.notifications.notifyAdmins({
      type: 'class',
      title: `Nueva clase creada: ${created.title}`,
      message: `Se creó la clase "${created.title}"${
        enriched.committee ? ` (${enriched.committee.name})` : ''
      }${created.school ? ` en ${created.school}` : ''} con ${instructors.length} instructor(es).`,
      link: '/clases',
      metadata: { classId: created.id },
    });

    // Notificar a miembros del comité si la clase tiene comité asignado.
    void this.notifications.notifyCommitteeMembers(created.committeeId, {
      type: 'class',
      title: `Nueva clase en tu comité: ${created.title}`,
      message: `Se programó la clase "${created.title}"${
        created.date ? ` para el ${created.date}` : ''
      } en tu comité.`,
      link: '/clases',
      metadata: { classId: created.id },
    });

    return enriched;
  }

  async update(id: string, input: UpdateClassInput) {
    const { instructorIds, ...rest } = input;
    if (rest.committeeId !== undefined) {
      rest.committeeId = (rest.committeeId || null) as string | null;
    }

    // Reemplazo atómico del set de instructores: deleteMany + recreate.
    if (instructorIds) {
      await this.fs.deleteMany('classVolunteers', { where: { classId: id } });
      if (instructorIds.length > 0) {
        await Promise.all(
          instructorIds.map((volunteerId) =>
            this.fs.create<ClassVolunteerDoc>('classVolunteers', {
              classId: id,
              volunteerId,
              role: 'instructor',
            }),
          ),
        );
      }
    }

    // Firestore no acepta `undefined` en los payloads — limpiar.
    const data: Record<string, unknown> = { ...rest };
    Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);

    await this.fs.update<ClassDoc>('classes', id, data);

    const updated = await this.fs.findById<ClassDoc>('classes', id);
    if (!updated) throw new Error('Clase no encontrada tras actualizar');
    return this.enrichClass(updated);
  }

  async remove(id: string) {
    // Cascade manual: ClassVolunteer es onDelete: Cascade en el schema Prisma.
    await this.fs.deleteMany('classVolunteers', { where: { classId: id } });
    await this.fs.remove('classes', id);
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
    const cls = await this.fs.findById<ClassDoc>('classes', classId);
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

    // Lookup de instructores con su volunteer embebido (para notificaciones).
    const classVolunteers = await this.fs.findAll<ClassVolunteerDoc>('classVolunteers', {
      where: { classId },
    });
    const instructors = await Promise.all(
      classVolunteers.map(async (ci) => {
        const volunteer = ci.volunteerId
          ? await this.fs.findById<VolunteerDoc>('volunteers', ci.volunteerId)
          : null;
        return { ci, volunteer };
      }),
    );

    const hoursToAssign = Math.max(0, cls.durationHours);
    const assigned: { volunteerId: string; volunteerName: string; hours: number }[] = [];
    const skipped: { volunteerId: string; reason: string }[] = [];

    // Para clases no hay un Activity al que asociar las horas; las creamos sueltas
    // (activityId = null) con notas que mencionan la clase.
    if (hoursToAssign <= 0) {
      for (const { ci } of instructors) {
        skipped.push({
          volunteerId: ci.volunteerId,
          reason: 'La clase define 0 horas',
        });
      }
    } else {
      // Pre-cargar todas las socialHours de los instructores para evitar
      // N+1 lookups en el check de duplicados. Firestore no soporta substring
      // search (no existe `contains` como en Prisma) → filtramos client-side.
      const noteMarker = `[clase:${cls.id}]`;
      const volunteerIds = instructors.map((i) => i.ci.volunteerId).filter(Boolean) as string[];
      const existingHours: SocialHourDoc[] =
        volunteerIds.length > 0
          ? await this.fs.findAll<SocialHourDoc>('socialHours', {
              where: { volunteerId: { op: 'in', value: volunteerIds } },
            })
          : [];

      for (const { ci, volunteer } of instructors) {
        // Evitar duplicados: si el instructor ya tiene una hora con la misma
        // nota+mismo día, no la volvemos a crear. Heurístico (sin FK directa).
        const dup = existingHours.find(
          (h) => h.volunteerId === ci.volunteerId && h.notes.includes(noteMarker),
        );
        if (dup) {
          skipped.push({
            volunteerId: ci.volunteerId,
            reason: 'Ya tenía horas registradas para esta clase',
          });
          continue;
        }

        await this.fs.create<SocialHourDoc>('socialHours', {
          volunteerId: ci.volunteerId,
          activityId: null,
          hours: hoursToAssign,
          type: 'field', // las clases siempre cuentan como horas de campo
          date: cls.date || new Date().toISOString().slice(0, 10),
          notes: `${noteMarker} Horas asignadas automáticamente al finalizar la clase "${cls.title}"${
            cls.school ? ` en ${cls.school}` : ''
          }.`,
          approvalStatus: 'approved',
          reviewerId,
          reviewedAt: new Date().toISOString(),
        });
        assigned.push({
          volunteerId: ci.volunteerId,
          volunteerName: volunteer?.name ?? 'Voluntario',
          hours: hoursToAssign,
        });
      }
    }

    // Marcar la clase como completada
    await this.fs.update<ClassDoc>('classes', classId, {
      status: 'completed',
      completedAt: new Date().toISOString(),
    });

    // Notificar a cada instructor con horas asignadas
    void this.notifications.createMany(
      assigned.map((a) => ({
        userId: a.volunteerId,
        type: 'social_hour' as const,
        title: `+${a.hours}h aprobadas · Clase: ${cls.title}`,
        message: `Se finalizó la clase "${cls.title}"${
          cls.school ? ` en ${cls.school}` : ''
        } y se te asignaron ${a.hours} hora(s) social(es) de tipo de campo. Revisa tu perfil para ver tu total acumulado.`,
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
      message: `Se finalizó la clase "${cls.title}". Se asignaron ${hoursToAssign}h de campo a ${assigned.length} instructor(es).${
        skipped.length > 0 ? ` ${skipped.length} omitido(s).` : ''
      }`,
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
