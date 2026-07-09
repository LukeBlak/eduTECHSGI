import { inject, Injectable } from '@/server/core/container';
import fs from 'fs';
import path from 'path';
import nodemailer, { type Transporter } from 'nodemailer';
import {
  type EmailConfig,
  type EmailMode,
  type EmailStatus,
  type NotificationEmailPayload,
  type SendResult,
} from './dto/email.dto';

const CONFIG_FILE = path.join(dataDir(), '.email-config.json');
const STATE_FILE = path.join(dataDir(), '.email-state.json');

/**
 * Directorio de datos para archivos de configuración/estado de email.
 *
 * En Vercel (NODE_ENV=production) el filesystem es read-only excepto `/tmp`.
 * Usamos `/tmp/edutech` para que las escrituras no crasheen.
 *
 * ADVERTENCIA (Vercel serverless): cada invocación es efímera — la
 * configuración guardada NO persiste entre invocaciones. Esto es una
 * limitación conocida. Una tarea futura debe migrar la configuración
 * a la BD (tabla Settings) para que persista realmente.
 *
 * En desarrollo local usamos `process.cwd()` para que la config persista
 * entre reinicios del dev server.
 */
function dataDir(): string {
  return process.env.NODE_ENV === 'production'
    ? '/tmp/edutech'
    : process.cwd();
}

/** Asegura que el directorio de datos existe antes de escribir. */
function ensureDataDir(): void {
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
  } catch {
    // Si /tmp no es escribible (caso patológico), ignoramos — las
    // escrituras posteriores fallarán en try/catch del caller sin
    // crasherar la operación de negocio.
  }
}

interface EmailState {
  lastSentAt: string | null;
  lastPreviewUrl: string | null;
  sentCount: number;
}

const DEFAULT_CONFIG: EmailConfig = {
  mode: 'ethereal',
  enabled: true,
  fromName: 'EduTECH ESEN',
  fromEmail: 'notificaciones@edutech-esen.org',
};

const DEFAULT_STATE: EmailState = {
  lastSentAt: null,
  lastPreviewUrl: null,
  sentCount: 0,
};

@Injectable()
export class EmailService {
  /** Cache del transporter creado (se recrea si cambia la config). */
  private cachedTransporter: Transporter | null = null;
  private cachedMode: EmailMode | null = null;
  /** Cuenta de Ethereal creada una sola vez y reutilizada. */
  private etherealAccount: { user: string; pass: string } | null = null;

  /** Lee la configuración persistida (con defaults si no existe). */
  getStoredConfig(): EmailConfig {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_CONFIG, ...parsed };
      }
    } catch (e) {
      console.error('[email] error leyendo config:', e);
    }
    return { ...DEFAULT_CONFIG };
  }

  /** Guarda la configuración (mergeando con la existente para credenciales). */
  saveConfig(partial: Partial<EmailConfig>): EmailConfig {
    const current = this.getStoredConfig();
    // Si smtpPass viene vacío pero ya hay uno guardado, conservamos el existente.
    if (partial.smtpPass === '' && current.smtpPass) {
      partial.smtpPass = current.smtpPass;
    }
    if (partial.resendApiKey === '' && current.resendApiKey) {
      partial.resendApiKey = current.resendApiKey;
    }
    if (partial.brevoApiKey === '' && current.brevoApiKey) {
      partial.brevoApiKey = current.brevoApiKey;
    }
    const merged: EmailConfig = { ...current, ...partial };
    ensureDataDir();
    try {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf-8');
    } catch (e) {
      console.error('[email] error guardando config:', e);
    }
    // Invalidar cache del transporter para que se regenere con la nueva config.
    this.cachedTransporter = null;
    this.cachedMode = null;
    return merged;
  }

  /** Lee el estado de envíos persistido. */
  private getState(): EmailState {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const raw = fs.readFileSync(STATE_FILE, 'utf-8');
        return { ...DEFAULT_STATE, ...JSON.parse(raw) };
      }
    } catch {
      /* ignore */
    }
    return { ...DEFAULT_STATE };
  }

  /** Guarda el estado de envíos. */
  private setState(state: Partial<EmailState>) {
    const merged = { ...this.getState(), ...state };
    ensureDataDir();
    try {
      fs.writeFileSync(STATE_FILE, JSON.stringify(merged, null, 2), 'utf-8');
    } catch (e) {
      console.error('[email] error guardando state:', e);
    }
  }

  /** Devuelve el estado del módulo para la UI (sin exponer credenciales). */
  status(): EmailStatus {
    const cfg = this.getStoredConfig();
    const state = this.getState();
    let hasCredentials = false;
    let credentialHint = '';
    switch (cfg.mode) {
      case 'ethereal':
        hasCredentials = true;
        credentialHint = 'Cuenta demo automática (Ethereal)';
        break;
      case 'brevo':
        hasCredentials = Boolean(cfg.brevoApiKey && cfg.brevoLogin);
        credentialHint = cfg.brevoLogin || '';
        break;
      case 'gmail':
        hasCredentials = Boolean(cfg.smtpUser && cfg.smtpPass);
        credentialHint = cfg.smtpUser || '';
        break;
      case 'smtp':
        hasCredentials = Boolean(cfg.smtpHost && cfg.smtpUser && cfg.smtpPass);
        credentialHint = cfg.smtpUser ? `${cfg.smtpUser}@${cfg.smtpHost || ''}` : '';
        break;
      case 'resend':
        hasCredentials = Boolean(cfg.resendApiKey);
        credentialHint = cfg.resendApiKey
          ? `${cfg.resendApiKey.slice(0, 3)}****${cfg.resendApiKey.slice(-2)}`
          : '';
        break;
      case 'none':
      default:
        hasCredentials = false;
        credentialHint = 'Email deshabilitado';
        break;
    }
    return {
      mode: cfg.mode,
      enabled: cfg.enabled,
      fromName: cfg.fromName,
      fromEmail: cfg.fromEmail,
      hasCredentials,
      credentialHint,
      lastSentAt: state.lastSentAt,
      lastPreviewUrl: state.lastPreviewUrl,
      sentCount: state.sentCount,
    };
  }

  /** Crea (o reutiliza) el transporter adecuado al modo configurado. */
  private async getTransporter(): Promise<Transporter | null> {
    const cfg = this.getStoredConfig();
    if (cfg.mode === 'none' || !cfg.enabled) return null;

    if (this.cachedTransporter && this.cachedMode === cfg.mode) {
      return this.cachedTransporter;
    }

    let transporter: Transporter;

    switch (cfg.mode) {
      case 'ethereal': {
        // Crea una cuenta de prueba de Ethereal una sola vez.
        if (!this.etherealAccount) {
          try {
            const account = await nodemailer.createTestAccount();
            this.etherealAccount = { user: account.user, pass: account.pass };
          } catch (e) {
            console.error('[email] error creando cuenta Ethereal:', e);
            return null;
          }
        }
        transporter = nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: {
            user: this.etherealAccount.user,
            pass: this.etherealAccount.pass,
          },
        });
        break;
      }
      case 'brevo': {
        if (!cfg.brevoApiKey || !cfg.brevoLogin) return null;
        // Brevo (ex Sendinblue) expone SMTP relay en smtp-relay.brevo.com:587
        // Login = email master de la cuenta Brevo, Password = SMTP key (xkeysib-...)
        transporter = nodemailer.createTransport({
          host: 'smtp-relay.brevo.com',
          port: 587,
          secure: false,
          auth: { user: cfg.brevoLogin, pass: cfg.brevoApiKey },
        });
        break;
      }
      case 'gmail': {
        if (!cfg.smtpUser || !cfg.smtpPass) return null;
        transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
        });
        break;
      }
      case 'smtp': {
        if (!cfg.smtpHost || !cfg.smtpUser || !cfg.smtpPass) return null;
        transporter = nodemailer.createTransport({
          host: cfg.smtpHost,
          port: cfg.smtpPort ?? 587,
          secure: cfg.smtpSecure ?? false,
          auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
        });
        break;
      }
      case 'resend': {
        if (!cfg.resendApiKey) return null;
        // Resend expone un endpoint SMTP compatible en smtp.resend.com:465
        transporter = nodemailer.createTransport({
          host: 'smtp.resend.com',
          port: 465,
          secure: true,
          auth: { user: 'resend', pass: cfg.resendApiKey },
        });
        break;
      }
      default:
        return null;
    }

    this.cachedTransporter = transporter;
    this.cachedMode = cfg.mode;
    return transporter;
  }

  /** Envía un email de prueba al destinatario indicado. */
  async sendTestEmail(to: string): Promise<SendResult> {
    const cfg = this.getStoredConfig();
    if (cfg.mode === 'none' || !cfg.enabled) {
      return { ok: false, message: 'Email deshabilitado. Activa un modo de envío primero.' };
    }
    const transporter = await this.getTransporter();
    if (!transporter) {
      return { ok: false, message: 'No hay credenciales configuradas para el modo activo.' };
    }
    try {
      const info = await transporter.sendMail({
        from: `"${cfg.fromName}" <${cfg.fromEmail}>`,
        to,
        subject: '✓ Prueba de notificaciones — EduTECH ESEN',
        html: this.renderTestEmail(),
      });
      const previewUrl = cfg.mode === 'ethereal' ? nodemailer.getTestMessageUrl(info) || '' : '';
      this.recordSent(previewUrl);
      return {
        ok: true,
        message:
          cfg.mode === 'ethereal'
            ? 'Email de prueba enviado (modo demo). Ábrelo en la URL de preview generada.'
            : `Email de prueba enviado a ${to}`,
        previewUrl: previewUrl || undefined,
        messageId: info.messageId,
      };
    } catch (e) {
      return {
        ok: false,
        message: 'Error al enviar email de prueba',
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  /** Envía una notificación por email con plantilla HTML. */
  async sendNotificationEmail(payload: NotificationEmailPayload): Promise<SendResult> {
    const cfg = this.getStoredConfig();
    if (cfg.mode === 'none' || !cfg.enabled) {
      return { ok: false, message: 'Email deshabilitado' };
    }
    const transporter = await this.getTransporter();
    if (!transporter) {
      return { ok: false, message: 'No hay credenciales configuradas' };
    }
    try {
      const subject = `[EduTECH] ${payload.title}`;
      const info = await transporter.sendMail({
        from: `"${cfg.fromName}" <${cfg.fromEmail}>`,
        to: payload.to,
        subject,
        html: this.renderNotificationEmail(payload),
        text: `${payload.title}\n\nHola ${payload.userName},\n\n${payload.message}\n\n— EduTECH ESEN`,
      });
      const previewUrl = cfg.mode === 'ethereal' ? nodemailer.getTestMessageUrl(info) || '' : '';
      this.recordSent(previewUrl);
      return {
        ok: true,
        message: 'Email enviado',
        previewUrl: previewUrl || undefined,
        messageId: info.messageId,
      };
    } catch (e) {
      return {
        ok: false,
        message: 'Error al enviar email',
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  /** Registra un envío en el estado (timestamp + preview + contador). */
  private recordSent(previewUrl: string) {
    this.setState({
      lastSentAt: new Date().toISOString(),
      lastPreviewUrl: previewUrl || null,
      sentCount: this.getState().sentCount + 1,
    });
  }

  /* ---------- Plantillas HTML ---------- */

  private renderTestEmail(): string {
    const palette = '#10616D';
    const accent = '#00B0B7';
    return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
      <div style="max-width:560px;margin:0 auto;padding:24px">
        <div style="background:${palette};border-radius:14px 14px 0 0;padding:28px 32px;color:white">
          <h1 style="margin:0;font-size:20px;font-weight:700">EduTECH ESEN</h1>
          <p style="margin:4px 0 0;opacity:.85;font-size:13px">Notificaciones por email — configuración verificada</p>
        </div>
        <div style="background:white;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 14px 14px;padding:28px 32px">
          <p style="margin:0 0 16px;font-size:15px;color:#374151">¡Hola!</p>
          <p style="margin:0 0 16px;font-size:15px;color:#374151">Si recibiste este correo, tu configuración de notificaciones por email funciona correctamente. A partir de ahora, los eventos importantes del sistema (nuevas horas sociales, actividades, ingresos, egresos) generarán notificaciones que también llegarán a esta bandeja.</p>
          <div style="background:${accent}15;border-left:3px solid ${accent};border-radius:8px;padding:12px 16px;margin:20px 0">
            <p style="margin:0;font-size:13px;color:${palette}"><strong>Tip:</strong> Puedes cambiar el modo de envío (demo, Gmail, SMTP, Resend) en cualquier momento desde la sección Notificaciones del panel de administración.</p>
          </div>
          <hr style="border:none;border-top:1px solid #f0f0f0;margin:24px 0">
          <p style="margin:0;font-size:12px;color:#9ca3af">Este es un correo de prueba generado automáticamente por EduTECH ESEN.</p>
        </div>
      </div>
    </body></html>`;
  }

  private renderNotificationEmail(p: NotificationEmailPayload): string {
    const palette = '#10616D';
    const accent = '#00B0B7';
    const typeLabel: Record<string, string> = {
      social_hour: 'Horas Sociales',
      activity: 'Actividad',
      income: 'Ingreso',
      expense: 'Egreso',
      volunteer: 'Voluntario',
      system: 'Sistema',
      hour_request: 'Solicitud de Horas',
      class: 'Clase',
    };
    const label = typeLabel[p.type] ?? 'Sistema';
    const linkHtml = p.link
      ? `<a href="${p.link}" style="display:inline-block;background:${palette};color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px;margin-top:12px">Ver en el panel</a>`
      : '';
    return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
      <div style="max-width:560px;margin:0 auto;padding:24px">
        <div style="background:${palette};border-radius:14px 14px 0 0;padding:28px 32px;color:white">
          <h1 style="margin:0;font-size:20px;font-weight:700">EduTECH ESEN</h1>
          <p style="margin:4px 0 0;opacity:.85;font-size:13px">Notificación · ${label}</p>
        </div>
        <div style="background:white;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 14px 14px;padding:28px 32px">
          <p style="margin:0 0 8px;font-size:13px;color:${accent};font-weight:600;text-transform:uppercase;letter-spacing:.05em">${label}</p>
          <h2 style="margin:0 0 16px;font-size:18px;color:#111827;font-weight:700">${this.escape(p.title)}</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6">Hola ${this.escape(p.userName)},</p>
          <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6">${this.escape(p.message)}</p>
          ${linkHtml}
          <hr style="border:none;border-top:1px solid #f0f0f0;margin:24px 0">
          <p style="margin:0;font-size:12px;color:#9ca3af">Recibes este correo porque tu cuenta de EduTECH ESEN tiene notificaciones por email activadas. Si crees que esto es un error, contacta al administrador del sistema.</p>
        </div>
      </div>
    </body></html>`;
  }

  private escape(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
