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
import { sanitizeVolunteer } from '@/server/core/sanitize';
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
  /**
   * Referencia a la clase que generó estas horas (cuando fueron
   * auto-asignadas al finalizar una clase). Es null para horas creadas
   * manualmente o vinculadas a una `activity`.
   */
  classId: string | null;
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
   *
   * Deduplica classVolunteers por volunteerId (defensivo): si por un bug previo
   * quedaron docs gemelos, solo se retorna una vez el instructor en la lista.
   * El cleanup real de los docs duplicados ocurre en `update` (diff & sync).
   */
  private async enrichClass(c: ClassDoc) {
    const [committee, classVolunteers] = await Promise.all([
      c.committeeId
        ? this.fs.findById<CommitteeDoc>('committees', c.committeeId)
        : Promise.resolve(null),
      this.fs.findAll<ClassVolunteerDoc>('classVolunteers', { where: { classId: c.id } }),
    ]);
    // Dedup por volunteerId: conserva solo el primer doc de cada volunteer.
    const seenVolunteerIds = new Set<string>();
    const uniqueClassVolunteers = classVolunteers.filter((cv) => {
      if (!cv.volunteerId || seenVolunteerIds.has(cv.volunteerId)) return false;
      seenVolunteerIds.add(cv.volunteerId);
      return true;
    });
    const instructorsRaw = await Promise.all(
      uniqueClassVolunteers.map(async (ci) => {
        const volunteer = ci.volunteerId
          ? await this.fs.findById<VolunteerDoc>('volunteers', ci.volunteerId)
          : null;
        return { ci, volunteer };
      }),
    );
    // Mantiene el shape de Prisma: { ...volunteer, role }
    const instructors = instructorsRaw
      .filter((x) => x.volunteer !== null)
      .map((x) => ({ ...sanitizeVolunteer(x.volunteer)!, role: x.ci.role }));
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
    // Deduplicar instructores defensivamente (evita docs gemelos en
    // classVolunteers si el frontend envía ids repetidos).
    const uniqueInstructorIds = [...new Set(instructorIds.filter(Boolean))];

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
    if (uniqueInstructorIds.length > 0) {
      await Promise.all(
        uniqueInstructorIds.map((volunteerId) =>
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

    // ─── Sync de instructores (diff & sync, NO delete-all + recreate) ───
    // El approach anterior (deleteMany + recreate) era frágil: si el deleteMany
    // no encontraba los docs (p.ej. por un where que no matcheaba), los creates
    // se acumulaban y duplicaban a los instructores existentes.
    //
    // Nuevo approach idempotente:
    //   1. Trae los classVolunteers existentes para esta clase.
    //   2. Detecta duplicados (mismo volunteerId aparece >1 vez) y los marca
    //      para borrado — limpia duplicados históricos.
    //   3. Borra los que NO están en la nueva lista.
    //   4. Crea solo los nuevos que no existen todavía.
    //   5. Conserva los que ya estaban (sin delete+recreate innecesario).
    if (instructorIds) {
      const uniqueInstructorIds = [...new Set(instructorIds.filter(Boolean))];

      const existing = await this.fs.findAll<ClassVolunteerDoc>('classVolunteers', {
        where: { classId: id },
      });

      // Mapa volunteerId → primer doc encontrado; el resto son duplicados.
      const existingByVolunteerId = new Map<string, ClassVolunteerDoc>();
      const duplicates: ClassVolunteerDoc[] = [];
      for (const cv of existing) {
        if (existingByVolunteerId.has(cv.volunteerId)) {
          duplicates.push(cv); // doc duplicado — limpiar
        } else {
          existingByVolunteerId.set(cv.volunteerId, cv);
        }
      }

      const newSet = new Set(uniqueInstructorIds);
      const toDelete = [
        ...duplicates,
        ...existing.filter((cv) => !newSet.has(cv.volunteerId)),
      ];
      const toCreate = uniqueInstructorIds.filter(
        (vid) => !existingByVolunteerId.has(vid),
      );

      if (toDelete.length > 0) {
        await Promise.all(
          toDelete.map((cv) => this.fs.remove('classVolunteers', cv.id)),
        );
      }
      if (toCreate.length > 0) {
        await Promise.all(
          toCreate.map((volunteerId) =>
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

  /**
   * Previsualiza el impacto de eliminar una clase: lista las horas
   * sociales (con voluntario) que se borrarían automáticamente al
   * confirmar la eliminación. El frontend lo usa para mostrar el diálogo
   * de confirmación con la lista de instructores afectados.
   *
   * Las horas sociales originadas por finalizar una clase tienen
   * `classId === cls.id` (ver complete()). Buscamos por ese campo.
   */
  async previewDeleteImpact(id: string): Promise<{
    classId: string;
    title: string;
    socialHoursCount: number;
    totalHours: number;
    affectedMembers: {
      volunteerId: string;
      volunteerName: string;
      studentId: string | null;
      hours: number;
      approvalStatus: string;
    }[];
  }> {
    const cls = await this.fs.findById<ClassDoc>('classes', id);
    const title = cls?.title ?? '(clase eliminada)';
    const socialHours = cls
      ? await this.fs.findAll<SocialHourDoc>('socialHours', { where: { classId: id } })
      : [];

    // Lookup de voluntarios para resolver nombres.
    const volunteerIds = [...new Set(socialHours.map((h) => h.volunteerId).filter(Boolean))];
    const volunteers = await Promise.all(
      volunteerIds.map((vid) => this.fs.findById<VolunteerDoc>('volunteers', vid)),
    );
    const volById = new Map<string, VolunteerDoc>();
    for (const v of volunteers) {
      if (v) volById.set(v.id, v);
    }

    const affectedMembers = socialHours.map((h) => {
      const v = volById.get(h.volunteerId);
      return {
        volunteerId: h.volunteerId,
        volunteerName: v?.name ?? 'Voluntario',
        studentId: v?.studentId ?? null,
        hours: h.hours,
        approvalStatus: h.approvalStatus,
      };
    });

    return {
      classId: id,
      title,
      socialHoursCount: socialHours.length,
      totalHours: socialHours.reduce((sum, h) => sum + (h.hours || 0), 0),
      affectedMembers,
    };
  }

  async remove(id: string) {
    // Firestore no tiene FK cascade: limpiamos manualmente las relaciones.
    // - classVolunteers: onDelete: Cascade → borrar
    // - socialHours: onDelete: Cascade → BORRAR (las horas auto-asignadas
    //   al finalizar esta clase se eliminan — incluyendo las ya aprobadas).
    //   El frontend muestra un diálogo de confirmación con la lista de
    //   instructores afectados antes de llegar aquí (ver previewDeleteImpact).
    //
    //   Borramos por AMBOS campos (belt-and-suspenders):
    //   - `classId === id` → registros post-FIX-5 (classId seteado).
    //   - `activityId === id` → registros post-FIX-5 también (activityId
    //     fue seteado a cls.id en FIX-5). Esto es redundante con classId
    //     pero no hace daño y protege contra inconsistencias de datos.
    await Promise.all([
      this.fs.deleteMany('classVolunteers', { where: { classId: id } }),
      this.fs.deleteMany('socialHours', { where: { classId: id } }),
      this.fs.deleteMany('socialHours', { where: { activityId: id } }),
    ]);
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
    // QA-B-05: Atomic claim — si la clase ya fue completada por otra
    // llamada concurrente, abortamos sin asignar horas dobles.
    const { claimed, doc: claimedDoc } = await this.fs.atomicClaim<ClassDoc>(
      'classes',
      classId,
      (d) => !!d && d.status === 'active',
      { status: 'completed', completedAt: new Date().toISOString() },
    );

    if (!claimedDoc) {
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

    if (!claimed) {
      // Otra llamada concurrente ganó la carrera → ya está completada.
      return {
        success: false,
        message: 'La clase ya fue finalizada anteriormente',
        classId,
        title: claimedDoc.title,
        hoursPerInstructor: claimedDoc.durationHours,
        assignedCount: 0,
        skipped: [],
        alreadyCompleted: true,
      };
    }

    const cls = claimedDoc;

    // Lookup de instructores con su volunteer embebido (para notificaciones).
    // Dedup por volunteerId: si por un bug previo quedaron docs gemelos en
    // classVolunteers, no queremos asignar horas dobles al mismo instructor.
    const allClassVolunteers = await this.fs.findAll<ClassVolunteerDoc>('classVolunteers', {
      where: { classId },
    });
    const seenVolunteerIds = new Set<string>();
    const classVolunteers = allClassVolunteers.filter((cv) => {
      if (!cv.volunteerId || seenVolunteerIds.has(cv.volunteerId)) return false;
      seenVolunteerIds.add(cv.volunteerId);
      return true;
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

    // Las clases NO son Activities en este modelo, así que activityId queda
    // en null (correcto semánticamente). Pero guardamos `classId` para que la
    // hora sea trazable a la clase que la originó (lookup en el enrich de
    // social-hours.service.ts).
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
        // Evitar duplicados: si el instructor ya tiene una hora para esta
        // clase (mismo classId), no la volvemos a crear. Usamos classId
        // como clave principal y notes como fallback para horas legacy
        // (creadas antes de que existiera el campo classId).
        const dup = existingHours.find(
          (h) =>
            h.volunteerId === ci.volunteerId &&
            (h.classId === cls.id || h.notes.includes(noteMarker)),
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
          // activityId referencia el ID de la clase que originó las horas
          // (las clases no están en la colección `activities`, pero
          // guardamos el ID aquí para trazabilidad directa desde la consola
          // de Firebase). `classId` se mantiene como marcador de tipo.
          activityId: cls.id,
          classId: cls.id,
          hours: hoursToAssign,
          type: 'field', // las clases siempre cuentan como horas de campo
          date: cls.date || new Date().toISOString().slice(0, 10),
          // La nota visible para el usuario NO incluye el ID de la clase
          // (no queremos exponer IDs internos). El `noteMarker` solo se
          // usa internamente como fallback de dedup para registros legacy
          // (creados antes de que existiera el campo `classId`); los
          // registros nuevos siempre llevan `classId` y se dedup por ahí.
          notes: `Horas asignadas automáticamente al finalizar la clase "${cls.title}"${
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

    // La clase ya fue marcada como 'completed' atómicamente en el
    // atomicClaim al inicio de complete() — no es necesario un segundo
    // update aquí (QA-B-05).

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
