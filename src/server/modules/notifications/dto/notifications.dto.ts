import { z } from 'zod';

/** Tipos de evento que generan una notificación. */
export const NOTIF_TYPES = [
  'social_hour',
  'activity',
  'income',
  'expense',
  'volunteer',
  'system',
  'hour_request',
  'class',
] as const;
export type NotifType = (typeof NOTIF_TYPES)[number];

/** Payload interno para crear una notificación. */
export interface CreateNotificationInput {
  userId: string;
  type: NotifType;
  title: string;
  message?: string;
  link?: string;
  metadata?: Record<string, unknown>;
  /** Si true (default), intenta enviar también por email cuando el destinatario tenga email. */
  sendEmail?: boolean;
}

/** Filtros de listado. */
export interface ListNotifFilters {
  /** Si true, devuelve solo no leídas. */
  unreadOnly?: boolean;
  /** Límite de resultados (default 50, max 200). */
  limit?: number;
}

/** Esquema para marcar una notificación como leída (id en ruta). */
export const MarkReadSchema = z.object({ id: z.string().min(1) });
