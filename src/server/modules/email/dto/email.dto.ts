import { z } from 'zod';

/** Modos de transporte de email soportados. */
export const EMAIL_MODES = ['none', 'ethereal', 'brevo', 'gmail', 'smtp', 'resend'] as const;
export type EmailMode = (typeof EMAIL_MODES)[number];

/** Configuración persistida en `.email-config.json`. */
export interface EmailConfig {
  mode: EmailMode;
  enabled: boolean;
  /** Remitente visible (ej. "EduTECH ESEN <notificaciones@edutech-esen.org>"). */
  fromName: string;
  /** Email remitente. */
  fromEmail: string;
  /** SMTP host (modo smtp). */
  smtpHost?: string;
  /** SMTP port (modo smtp). */
  smtpPort?: number;
  /** SMTP secure (true=465, false=587). */
  smtpSecure?: boolean;
  /** Usuario SMTP (modo smtp/gmail). */
  smtpUser?: string;
  /** Contraseña SMTP / App Password (modo smtp/gmail). */
  smtpPass?: string;
  /** API key de Resend (modo resend). */
  resendApiKey?: string;
  /** SMTP key de Brevo (modo brevo). */
  brevoApiKey?: string;
  /** Login de Brevo (email con el que se registró en brevo.com). */
  brevoLogin?: string;
}

/** Esquema de validación para guardar configuración. */
export const EmailConfigSchema = z.object({
  mode: z.enum(EMAIL_MODES),
  enabled: z.boolean().default(true),
  fromName: z.string().min(1).default('EduTECH ESEN'),
  fromEmail: z.string().email().default('notificaciones@edutech-esen.org'),
  smtpHost: z.string().optional(),
  smtpPort: z.number().int().min(1).max(65535).optional(),
  smtpSecure: z.boolean().optional(),
  smtpUser: z.string().optional(),
  smtpPass: z.string().optional(),
  resendApiKey: z.string().optional(),
  brevoApiKey: z.string().optional(),
  brevoLogin: z.string().optional(),
});

/** Estado del módulo de email devuelto a la UI. */
export interface EmailStatus {
  mode: EmailMode;
  enabled: boolean;
  fromName: string;
  fromEmail: string;
  /** Indica si hay credenciales guardadas para el modo activo. */
  hasCredentials: boolean;
  /** Hint enmascarado de la credencial (ej. "user@gmail.com", "re_****"). */
  credentialHint: string;
  /** Timestamp de la última vez que se envió un email (ISO). */
  lastSentAt: string | null;
  /** Última URL de preview de Ethereal (solo modo ethereal). */
  lastPreviewUrl: string | null;
  /** Conteo de emails enviados (persistido en estado). */
  sentCount: number;
}

/** Resultado de enviar un email. */
export interface SendResult {
  ok: boolean;
  message: string;
  previewUrl?: string;
  messageId?: string;
  error?: string;
}

/** Payload para enviar una notificación por email. */
export interface NotificationEmailPayload {
  to: string;
  userName: string;
  title: string;
  message: string;
  link?: string;
  type: string;
}
