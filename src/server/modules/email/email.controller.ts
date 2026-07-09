import { NextRequest } from 'next/server';
import { inject, Injectable } from '@/server/core/container';
import { ok, badRequest, serverError } from '@/server/core/http';
import { EmailService } from './email.service';
import { EmailConfigSchema } from './dto/email.dto';

@Injectable()
export class EmailController {
  private readonly service = inject(EmailService);

  /** GET /api/email/config — configuración enmascarada + estado */
  async getConfig() {
    try {
      return ok(this.service.status());
    } catch (e) {
      return serverError('Error al obtener configuración de email', e);
    }
  }

  /** PUT /api/email/config — guarda la configuración */
  async saveConfig(req: NextRequest) {
    try {
      const body = await req.json();
      const parsed = EmailConfigSchema.safeParse(body);
      if (!parsed.success) {
        return badRequest(
          parsed.error.issues[0]?.message ?? 'Configuración de email inválida',
        );
      }
      this.service.saveConfig(parsed.data);
      return ok({
        success: true,
        message: 'Configuración de email guardada',
        status: this.service.status(),
      });
    } catch (e) {
      return serverError('Error al guardar configuración de email', e);
    }
  }

  /** POST /api/email/test — envía un email de prueba a `to` */
  async test(req: NextRequest) {
    try {
      const body = await req.json().catch(() => ({}));
      const to = typeof body?.to === 'string' ? body.to.trim() : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
        return badRequest('Se requiere un email destino válido');
      }
      const result = await this.service.sendTestEmail(to);
      return ok(result);
    } catch (e) {
      return serverError('Error al enviar email de prueba', e);
    }
  }
}
