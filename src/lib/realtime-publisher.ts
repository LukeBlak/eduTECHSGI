/**
 * Realtime publisher — cliente server-side para emitir eventos al mini-service
 * de WebSocket (mini-services/realtime-service, puerto 3004).
 *
 * Uso desde cualquier service/controller de Next.js:
 *
 *   import { realtime } from "@/lib/realtime-publisher";
 *   realtime.emit("activity:created", { activityId: act.id });
 *
 * El envío es fire-and-forget y no bloquea la response HTTP. Si el mini-service
 * está caído, se loguea un warning pero no se propaga el error (la operación de
 * negocio ya se completó en la BD).
 *
 * En Vercel (serverless) no hay mini-service realtime. Si
 * `REALTIME_INTERNAL_URL` no está configurada, `emit()` es un no-op silencioso:
 * no intenta el fetch a localhost, no loguea nada. La app sigue funcional sin
 * tiempo real (con polling de 30s como fallback).
 */

const INTERNAL_URL = process.env.REALTIME_INTERNAL_URL || "";
const INTERNAL_TOKEN =
  process.env.REALTIME_INTERNAL_TOKEN || "edutech-realtime-internal-token";

export interface RealtimeEvent {
  event: string;
  payload?: Record<string, unknown>;
  /** Si se especifica, el evento solo llega a ese usuario (notificaciones dirigidas). */
  userId?: string;
}

/** Tipos de eventos canónicos del sistema. */
export const REALTIME_EVENTS = {
  // Actividades
  ACTIVITY_CREATED: "activity:created",
  ACTIVITY_UPDATED: "activity:updated",
  ACTIVITY_DELETED: "activity:deleted",
  ACTIVITY_SUBSCRIBED: "activity:subscribed",
  ACTIVITY_UNSUBSCRIBED: "activity:unsubscribed",
  // Horas sociales
  SOCIAL_HOUR_CREATED: "social-hour:created",
  SOCIAL_HOUR_APPROVED: "social-hour:approved",
  SOCIAL_HOUR_REJECTED: "social-hour:rejected",
  // Ingresos / Egresos
  INCOME_CREATED: "income:created",
  INCOME_UPDATED: "income:updated",
  INCOME_DELETED: "income:deleted",
  EXPENSE_CREATED: "expense:created",
  EXPENSE_UPDATED: "expense:updated",
  EXPENSE_DELETED: "expense:deleted",
  // Voluntarios
  VOLUNTEER_CREATED: "volunteer:created",
  VOLUNTEER_UPDATED: "volunteer:updated",
  VOLUNTEER_DELETED: "volunteer:deleted",
  // Notificaciones (dirigidas a un usuario)
  NOTIFICATION_CREATED: "notification:created",
  // Logros / Achievements
  ACHIEVEMENT_CREATED: "achievement:created",
  ACHIEVEMENT_UPDATED: "achievement:updated",
  ACHIEVEMENT_DELETED: "achievement:deleted",
  ACHIEVEMENT_GRANTED: "achievement:granted",
  ACHIEVEMENT_REVOKED: "achievement:revoked",
  // Refresco global del dashboard
  DASHBOARD_REFRESH: "dashboard:refresh",
} as const;

type EventName = (typeof REALTIME_EVENTS)[keyof typeof REALTIME_EVENTS];

class RealtimePublisher {
  /**
   * Emite un evento a todos los clientes conectados (broadcast) o a un usuario
   * específico si `opts.userId` está presente. Fire-and-forget.
   */
  async emit(
    event: EventName | string,
    payload?: Record<string, unknown>,
    opts?: { userId?: string },
  ): Promise<void> {
    // En Vercel (serverless) no hay mini-service realtime: si la URL interna
    // no está configurada, no-op silencioso. No intentar fetch a localhost.
    if (!INTERNAL_URL) {
      return;
    }

    const body: RealtimeEvent = {
      event,
      payload,
      ...(opts?.userId ? { userId: opts.userId } : {}),
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      await fetch(INTERNAL_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${INTERNAL_TOKEN}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);
    } catch (err) {
      // No propagar: la operación de negocio ya se completó.
      console.warn(
        `[realtime] No se pudo emitir evento "${event}" al servicio WebSocket:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  /** Helper: emite un evento dirigido a un usuario. */
  async emitToUser(
    userId: string,
    event: EventName | string,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    return this.emit(event, payload, { userId });
  }

  /** Helper: refresco global del dashboard. */
  async refreshDashboard(payload?: Record<string, unknown>): Promise<void> {
    return this.emit(REALTIME_EVENTS.DASHBOARD_REFRESH, payload);
  }
}

/** Singleton compartido por toda la app. */
export const realtime = new RealtimePublisher();
