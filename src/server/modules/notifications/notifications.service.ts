/**
 * Notifications Service — notificaciones in-app dirigidas a voluntarios.
 *
 * Migrado de Prisma a Firestore. Este servicio es inyectado por muchos otros
 * (auth, volunteers, activities, classes, income, expenses, social-hours,
 * hour-requests) — todas las firmas y return shapes se preservan exactamente.
 *
 * Notas:
 *  - `select: { id: true }` (partial select de Prisma) → `findAll` + `.map(v => ({ id: v.id }))`.
 *  - `count({ where: { userId, read: false } })` → `this.fs.count('notifications', { userId, read: false })`.
 *  - `updateMany({ where, data })` → `this.fs.updateMany('notifications', where, data)` (devuelve count).
 *  - `realtime.emitToUser` se mantiene exactamente igual (publisher es otro módulo).
 */
import { inject, Injectable } from '@/server/core/container';
import { FIRESTORE_TOKEN, type FirestoreService } from '@/server/core/firestore.provider';
import type { CreateNotificationInput, ListNotifFilters } from './dto/notifications.dto';
import { PRIVILEGED_ROLES } from '@/server/core/jwt.util';
import { realtime, REALTIME_EVENTS } from '@/lib/realtime-publisher';

/** Roles con acceso completo (reciben notificaciones administrativas). */
const ADMIN_ROLES = PRIVILEGED_ROLES as readonly string[];

/** Tipo del documento Notification tal como se almacena en Firestore. */
interface NotificationDoc {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  link: string;
  read: boolean;
  emailed: boolean;
  metadata: string;
  createdAt: string;
}

/** Volunteer doc (campos mínimos para selects parciales). */
interface VolunteerDoc {
  id: string;
  name: string;
  email: string;
  role: string;
  committeeId: string | null;
}

@Injectable()
export class NotificationsService {
  private readonly fs = inject<FirestoreService>(FIRESTORE_TOKEN);

  /** Lista las notificaciones de un usuario, opcionalmente solo las no leídas. */
  async listForUser(userId: string, filters: ListNotifFilters = {}) {
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const [items, unreadCount] = await Promise.all([
      this.fs.findAll<NotificationDoc>('notifications', {
        where: {
          userId,
          ...(filters.unreadOnly ? { read: false } : {}),
        },
        orderBy: { field: 'createdAt', direction: 'desc' },
        limit,
      }),
      this.fs.count('notifications', { userId, read: false }),
    ]);
    return { items, unreadCount, total: items.length };
  }

  /** Cuenta cuántas notificaciones no leídas tiene un usuario. */
  async unreadCount(userId: string): Promise<number> {
    return this.fs.count('notifications', { userId, read: false });
  }

  /** Marca una notificación como leída (si pertenece al usuario). */
  async markAsRead(id: string, userId: string) {
    const notif = await this.fs.findById<NotificationDoc>('notifications', id);
    if (!notif || notif.userId !== userId) return null;
    await this.fs.update<NotificationDoc>('notifications', id, { read: true });
    return this.fs.findById<NotificationDoc>('notifications', id);
  }

  /** Marca todas las notificaciones no leídas del usuario como leídas. */
  async markAllRead(userId: string): Promise<number> {
    return this.fs.updateMany('notifications', { userId, read: false }, { read: true });
  }

  /**
   * Crea una notificación in-app para un usuario.
   * Las notificaciones son puramente visibles en el panel (sin envío por email).
   * Emite además un evento realtime dirigido al usuario para que el
   * NotificationsBell se actualice al instante (sin esperar al polling).
   */
  async create(input: CreateNotificationInput) {
    const created = await this.fs.create<NotificationDoc>('notifications', {
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message ?? '',
      link: input.link ?? '',
      read: false,
      emailed: false,
      metadata: input.metadata ? JSON.stringify(input.metadata) : '',
    });
    // Push realtime dirigido al usuario.
    void realtime.emitToUser(
      input.userId,
      REALTIME_EVENTS.NOTIFICATION_CREATED,
      {
        id: created.id,
        type: created.type,
        title: created.title,
        message: created.message,
        link: created.link,
        createdAt: created.createdAt,
      },
    );
    return created;
  }

  /** Notifica a varios usuarios a la vez (ej. todos los admins). */
  async createMany(inputs: CreateNotificationInput[]) {
    const results: NotificationDoc[] = [];
    for (const input of inputs) {
      try {
        results.push(await this.create(input));
      } catch (e) {
        console.error('[notifications] error creando notificación:', e);
      }
    }
    return results;
  }

  /**
   * Notifica a todos los usuarios con roles privilegiados (presidente,
   * vicepresidente, líder de comité, admin). Reemplaza al antiguo notifyAdmins.
   */
  async notifyAdmins(input: Omit<CreateNotificationInput, 'userId'>) {
    const admins = await this.fs.findAll<VolunteerDoc>('volunteers', {
      where: { role: { op: 'in', value: ADMIN_ROLES as string[] } },
    });
    return this.createMany(admins.map((a) => ({ ...input, userId: a.id })));
  }

  /** Notifica a todos los miembros de un comité. */
  async notifyCommitteeMembers(committeeId: string | null | undefined, input: Omit<CreateNotificationInput, 'userId'>) {
    if (!committeeId) return [];
    const members = await this.fs.findAll<VolunteerDoc>('volunteers', {
      where: { committeeId },
    });
    return this.createMany(members.map((m) => ({ ...input, userId: m.id })));
  }

  /** Notifica a todos los voluntarios (cualquier rol). Útil para anuncios globales. */
  async notifyAllVolunteers(input: Omit<CreateNotificationInput, 'userId'>) {
    const all = await this.fs.findAll<VolunteerDoc>('volunteers');
    return this.createMany(all.map((v) => ({ ...input, userId: v.id })));
  }

  /** Devuelve los destinatarios potenciales para mostrar en la UI de admin. */
  async recipientsSummary() {
    const all = await this.fs.findAll<VolunteerDoc>('volunteers');
    return {
      total: all.length,
      admins: all.filter((v) => (ADMIN_ROLES as readonly string[]).includes(v.role)).length,
    };
  }
}
