import { NextRequest } from 'next/server';
import { inject, Injectable } from '@/server/core/container';
import { ok, badRequest, serverError } from '@/server/core/http';
import { FirebaseService } from './firebase.service';
import { FirebaseConfigSchema } from './dto/firebase.dto';

@Injectable()
export class FirebaseController {
  private readonly service = inject(FirebaseService);

  /** GET /api/firebase/config — devuelve la configuración (sin privateKey completa) */
  async getConfig() {
    try {
      const config = this.service.getStoredConfig();
      // Mask the private key for security
      return ok({
        projectId: config.projectId,
        clientEmail: config.clientEmail,
        databaseUrl: config.databaseUrl,
        enabled: config.enabled,
        mode: config.mode,
        hasPrivateKey: Boolean(config.privateKey),
        privateKeyHint: config.privateKey
          ? `${config.privateKey.slice(0, 20)}...${config.privateKey.slice(-10)}`
          : '',
      });
    } catch (e) {
      return serverError('Error al obtener configuración', e);
    }
  }

  /** PUT /api/firebase/config — guarda la configuración */
  async saveConfig(req: NextRequest) {
    try {
      const body = await req.json();
      const parsed = FirebaseConfigSchema.safeParse(body);
      if (!parsed.success) {
        return badRequest(parsed.error.issues[0]?.message ?? 'Configuración inválida');
      }
      // If privateKey is empty string but we already have one stored, keep the existing
      const current = this.service.getStoredConfig();
      if (!parsed.data.privateKey && current.privateKey) {
        parsed.data.privateKey = current.privateKey;
      }
      const saved = this.service.saveConfig(parsed.data);
      return ok({
        success: true,
        message: 'Configuración guardada correctamente',
        config: {
          projectId: saved.projectId,
          clientEmail: saved.clientEmail,
          databaseUrl: saved.databaseUrl,
          enabled: saved.enabled,
          mode: saved.mode,
          hasPrivateKey: Boolean(saved.privateKey),
        },
      });
    } catch (e) {
      return serverError('Error al guardar configuración', e);
    }
  }

  /** GET /api/firebase/status — estado de conexión y última sincronización */
  async status() {
    try {
      return ok(this.service.getStatus());
    } catch (e) {
      return serverError('Error al obtener estado', e);
    }
  }

  /** POST /api/firebase/test — prueba la conexión a Firestore */
  async test() {
    try {
      const result = await this.service.testConnection();
      return ok(result);
    } catch (e) {
      return serverError('Error al probar conexión', e);
    }
  }

  /** POST /api/firebase/sync — sincroniza Firestore ⇄ Prisma (bidireccional en live) */
  async sync() {
    try {
      const result = await this.service.syncAll();
      return ok(result);
    } catch (e) {
      return serverError('Error durante la sincronización', e);
    }
  }

  /** POST /api/firebase/push — sube los datos locales (Prisma) a Firestore */
  async push() {
    try {
      const result = await this.service.pushLocalToFirestore();
      return ok(result);
    } catch (e) {
      return serverError('Error al subir datos a Firestore', e);
    }
  }

  /** POST /api/firebase/mock — carga datos de demostración (fuerza modo mock + sync) */
  async loadMock(req: NextRequest) {
    try {
      const body = await req.json().catch(() => ({}));
      const keepMode = body?.keepMode === true;
      // Ensure mock mode is active so sync uses mock data
      const current = this.service.getStoredConfig();
      if (!keepMode) {
        this.service.saveConfig({
          ...current,
          mode: 'mock',
          enabled: true,
        });
      }
      const result = await this.service.syncAll();
      return ok({
        success: true,
        message: 'Datos de demostración cargados correctamente desde Firebase (mock)',
        result,
      });
    } catch (e) {
      return serverError('Error al cargar datos de demostración', e);
    }
  }
}
