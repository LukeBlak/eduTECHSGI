/**
 * Firebase Service — integración con Firestore para EduTECH ESEN.
 *
 * Permite:
 *  1. Configurar credenciales de service account (Firebase Admin SDK).
 *  2. Probar la conexión a Firestore.
 *  3. Sincronizar (pull) las colecciones de Firestore hacia la base local (Prisma):
 *     committees, volunteers, activities, socialHours, incomes, expenses.
 *  4. Cargar datos de demostración (mock) que simulan una estructura de Firestore,
 *     para que la funcionalidad sea totalmente demostrable sin credenciales reales.
 *
 * Las credenciales se persisten en un archivo JSON local (.firebase-config.json)
 * para evitar migraciones de schema. La sync es un "pull" unidireccional
 * (Firestore → Prisma); los gráficos del frontend ya leen de Prisma vía las APIs
 * existentes, por lo que reflejan automáticamente los datos sincronizados.
 */
import { inject, Injectable } from '@/server/core/container';
import { PRISMA_TOKEN } from '@/server/core/prisma.provider';
import { MOCK_FIREBASE_DATA } from './mock-data';
import { FirebaseConfigSchema, type FirebaseConfig, type SyncResult, type SyncLogEntry } from './dto/firebase.dto';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const CONFIG_FILE = path.join(dataDir(), '.firebase-config.json');
const STATE_FILE = path.join(dataDir(), '.firebase-state.json');

/**
 * Directorio de datos para archivos de configuración/estado de Firebase.
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

// Collection names in Firestore
const COLLECTIONS = {
  committees: 'committees',
  volunteers: 'volunteers',
  activities: 'activities',
  socialHours: 'socialHours',
  incomes: 'incomes',
  expenses: 'expenses',
} as const;

@Injectable()
export class FirebaseService {
  private readonly db = inject<typeof import('@prisma/client').PrismaClient>(PRISMA_TOKEN);
  private app: any = null;
  private firestore: any = null;

  /* ----------------------------- Config ----------------------------- */

  getStoredConfig(): FirebaseConfig {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        const result = FirebaseConfigSchema.safeParse(parsed);
        if (result.success) return result.data;
      }
    } catch {
      /* ignore */
    }
    return {
      projectId: '',
      clientEmail: '',
      privateKey: '',
      databaseUrl: '',
      enabled: false,
      mode: 'mock',
    };
  }

  saveConfig(config: FirebaseConfig): FirebaseConfig {
    const parsed = FirebaseConfigSchema.safeParse(config);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? 'Configuración inválida');
    }
    ensureDataDir();
    try {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(parsed.data, null, 2), 'utf-8');
    } catch (e) {
      console.error('[firebase] error guardando config:', e);
    }
    // Reset cached app when config changes
    this.app = null;
    this.firestore = null;
    return parsed.data;
  }

  /* ----------------------------- Firestore REST API ----------------------------- */
  /*
   * En lugar de usar el SDK de firebase-admin (que crasheaba el proceso de
   * Next.js/Turbopack al intentar empaquetarlo), usamos la REST API de
   * Firestore directamente con OAuth2. Esto es más ligero y estable.
   *
   * Flujo:
   *   1. Construimos un JWT firmado con la private key del service account.
   *   2. Lo intercambiamos por un access token de OAuth2 en oauth2.googleapis.com.
   *   3. Usamos el token para llamar a firestore.googleapis.com.
   */
  private accessToken: string | null = null;
  private tokenExpiry = 0;

  /** Obtiene un access token de OAuth2 para Firestore (con caché). */
  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.accessToken && now < this.tokenExpiry - 60_000) {
      return this.accessToken;
    }
    const config = this.getStoredConfig();
    if (!config.projectId || !config.clientEmail || !config.privateKey) {
      throw new Error('Faltan credenciales de Firebase (projectId, clientEmail, privateKey)');
    }
    let jwt: string;
    try {
      jwt = this.buildServiceAccountJwt(config.clientEmail, config.privateKey);
    } catch (e: any) {
      throw new Error(`No se pudo firmar el JWT con la private key: ${e?.message ?? String(e)}. Verifica que la clave privada sea válida y esté completa (incluye -----BEGIN PRIVATE KEY----- y -----END PRIVATE KEY-----).`);
    }
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`OAuth2: ${tokenRes.status} ${errText.slice(0, 200)}`);
    }
    const tokenData: any = await tokenRes.json();
    this.accessToken = tokenData.access_token;
    this.tokenExpiry = now + (tokenData.expires_in ?? 3600) * 1000;
    return this.accessToken!;
  }

  /** Construye y firma un JWT para service account de Google. */
  private buildServiceAccountJwt(clientEmail: string, privateKeyRaw: string): string {
    // Normalizar la private key (\n literales → saltos reales)
    const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
    const header = { alg: 'RS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/datastore',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    };
    const enc = (o: any) =>
      Buffer.from(JSON.stringify(o)).toString('base64url');
    const unsigned = `${enc(header)}.${enc(payload)}`;
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(unsigned);
    sign.end();
    const signature = sign.sign(privateKey, 'base64url');
    return `${unsigned}.${signature}`;
  }

  /** Llama a la REST API de Firestore para listar documentos de una colección. */
  private async listDocuments(projectId: string, collectionId: string): Promise<any[]> {
    const token = await this.getAccessToken();
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionId}?pageSize=1000`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Firestore ${collectionId}: ${res.status} ${errText.slice(0, 300)}`);
    }
    const data: any = await res.json();
    if (!data.documents) return [];
    return data.documents.map((doc: any) => ({
      id: doc.name.split('/').pop(),
      ...this.decodeFirestoreFields(doc.fields),
    }));
  }

  /** Decodifica los campos tipados de Firestore al formato plano. */
  private decodeFirestoreFields(fields: any): any {
    const result: any = {};
    for (const [key, val] of Object.entries(fields || {})) {
      result[key] = this.decodeFirestoreValue(val as any);
    }
    return result;
  }

  private decodeFirestoreValue(val: any): any {
    if (!val || typeof val !== 'object') return val;
    if (val.stringValue !== undefined) return val.stringValue;
    if (val.integerValue !== undefined) return Number(val.integerValue);
    if (val.doubleValue !== undefined) return val.doubleValue;
    if (val.booleanValue !== undefined) return val.booleanValue;
    if (val.timestampValue !== undefined) return val.timestampValue;
    if (val.arrayValue?.values) return val.arrayValue.values.map((v: any) => this.decodeFirestoreValue(v));
    if (val.mapValue?.fields) return this.decodeFirestoreFields(val.mapValue.fields);
    if (val.nullValue !== undefined) return null;
    return val;
  }

  /* ----------------------------- PUSH (local → Firestore) ----------------------------- */
  /*
   * Permite escribir los datos de la BD local (Prisma) EN Firestore, creando
   * las colecciones y documentos. Esto resuelve el caso en el que el proyecto
   * de Firebase está vacío y el usuario quiere que su app llene Firestore.
   *
   * Usa la REST API de Firestore: PATCH .../documents/{collection}/{docId}
   * (crea el documento si no existe; lo actualiza si ya existe).
   */

  /** Codifica un valor plano al formato tipado de Firestore. */
  private encodeFirestoreValue(val: any): any {
    if (val === null || val === undefined) return { nullValue: null };
    if (typeof val === 'boolean') return { booleanValue: val };
    if (typeof val === 'number') {
      return Number.isInteger(val)
        ? { integerValue: String(val) }
        : { doubleValue: val };
    }
    if (typeof val === 'string') return { stringValue: val };
    if (val instanceof Date) return { timestampValue: val.toISOString() };
    if (Array.isArray(val)) {
      // Skip empty arrays (Firestore rejects empty arrayValue.values? Actually it's allowed but let's be safe)
      if (val.length === 0) return { arrayValue: { values: [] } };
      return { arrayValue: { values: val.map((v) => this.encodeFirestoreValue(v)) } };
    }
    if (typeof val === 'object') {
      const fields: any = {};
      for (const [k, v] of Object.entries(val)) {
        fields[k] = this.encodeFirestoreValue(v);
      }
      return { mapValue: { fields } };
    }
    return { stringValue: String(val) };
  }

  /** Crea o actualiza un documento en Firestore (upsert vía PATCH). */
  private async upsertDocument(
    projectId: string,
    collectionId: string,
    docId: string,
    fields: Record<string, any>,
  ): Promise<void> {
    const token = await this.getAccessToken();
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionId}/${docId}`;
    // Encode each field to Firestore's typed value format
    const encodedFields: Record<string, any> = {};
    for (const [k, v] of Object.entries(fields)) {
      encodedFields[k] = this.encodeFirestoreValue(v);
    }
    const body = JSON.stringify({ fields: encodedFields });
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Firestore upsert ${collectionId}/${docId}: ${res.status} ${errText.slice(0, 300)}`);
    }
  }

  /** Lee todos los datos locales (Prisma) y los sube a Firestore. */
  async pushLocalToFirestore(): Promise<SyncResult> {
    const config = this.getStoredConfig();
    const log: SyncLogEntry[] = [];
    const startedAt = new Date().toISOString();
    const pushLog = (collection: string, action: string, count: number, detail?: string) => {
      log.push({ collection, action, count, detail, timestamp: new Date().toISOString() });
    };

    if (!config.projectId || !config.clientEmail || !config.privateKey) {
      return {
        success: false,
        startedAt,
        finishedAt: new Date().toISOString(),
        mode: 'live',
        counts: { committees: 0, volunteers: 0, activities: 0, socialHours: 0, incomes: 0, expenses: 0 },
        log,
        error: 'Faltan credenciales de Firebase. Configura projectId, clientEmail y privateKey para subir datos.',
      };
    }

    try {
      const projectId = config.projectId;

      // 1. Committees
      const committees = await this.db.committee.findMany();
      let cCount = 0;
      for (const c of committees) {
        const docId = this.slugify(c.id);
        await this.upsertDocument(projectId, 'committees', docId, {
          name: c.name,
          description: c.description ?? '',
          color: c.color ?? 'turquoise',
          createdAt: c.createdAt?.toISOString() ?? null,
          updatedAt: c.updatedAt?.toISOString() ?? null,
        });
        cCount++;
      }
      pushLog('committees', 'push', cCount, `${cCount} comités subidos a Firestore`);

      // 2. Volunteers (resolve committee name)
      const committeeList = await this.db.committee.findMany();
      const committeeNameMap = new Map(committeeList.map((c) => [c.id, c.name]));
      const volunteers = await this.db.volunteer.findMany();
      let vCount = 0;
      for (const v of volunteers) {
        const docId = this.slugify(v.studentId || v.id);
        await this.upsertDocument(projectId, 'volunteers', docId, {
          name: v.name,
          studentId: v.studentId,
          career: v.career ?? '',
          email: v.email ?? '',
          phone: v.phone ?? '',
          role: v.role ?? 'volunteer',
          committee: v.committeeId ? (committeeNameMap.get(v.committeeId) ?? '') : '',
          password: v.password ?? '00000000',
          createdAt: v.createdAt?.toISOString() ?? null,
          updatedAt: v.updatedAt?.toISOString() ?? null,
        });
        vCount++;
      }
      pushLog('volunteers', 'push', vCount, `${vCount} voluntarios subidos a Firestore`);

      // 3. Activities
      const activities = await this.db.activity.findMany({ include: { volunteers: true } });
      let aCount = 0;
      for (const a of activities) {
        const docId = this.slugify(a.id);
        const linkedVolunteers = await this.db.activityVolunteer.findMany({
          where: { activityId: a.id },
          include: { volunteer: true },
        });
        const participantIds = linkedVolunteers.map((lv) => lv.volunteer.studentId);
        await this.upsertDocument(projectId, 'activities', docId, {
          title: a.title,
          description: a.description ?? '',
          type: a.type ?? '',
          startDate: a.startDate ?? '',
          endDate: a.endDate ?? '',
          location: a.location ?? '',
          hours: a.hours ?? 0,
          beneficiariesMen: a.beneficiariesMen ?? 0,
          beneficiariesWomen: a.beneficiariesWomen ?? 0,
          ods: a.ods ?? '',
          committee: a.committeeId ? (committeeNameMap.get(a.committeeId) ?? '') : '',
          volunteers: participantIds,
          createdAt: a.createdAt?.toISOString() ?? null,
          updatedAt: a.updatedAt?.toISOString() ?? null,
        });
        aCount++;
      }
      pushLog('activities', 'push', aCount, `${aCount} actividades subidas a Firestore`);

      // 4. Social Hours
      const hours = await this.db.socialHour.findMany({ include: { volunteer: true, activity: true } });
      let hCount = 0;
      for (const h of hours) {
        const docId = this.slugify(h.id);
        await this.upsertDocument(projectId, 'socialHours', docId, {
          studentId: h.volunteer?.studentId ?? '',
          volunteerName: h.volunteer?.name ?? '',
          activityTitle: h.activity?.title ?? '',
          hours: h.hours ?? 0,
          type: h.type ?? 'field',
          date: h.date ?? '',
          notes: h.notes ?? '',
          createdAt: h.createdAt?.toISOString() ?? null,
        });
        hCount++;
      }
      pushLog('socialHours', 'push', hCount, `${hCount} horas sociales subidas a Firestore`);

      // 5. Incomes
      const incomes = await this.db.income.findMany();
      let iCount = 0;
      for (const inc of incomes) {
        const docId = this.slugify(inc.id);
        await this.upsertDocument(projectId, 'incomes', docId, {
          concept: inc.concept,
          amount: inc.amount ?? 0,
          date: inc.date ?? '',
          source: inc.source ?? '',
          category: inc.category ?? 'general',
          notes: inc.notes ?? '',
          createdAt: inc.createdAt?.toISOString() ?? null,
        });
        iCount++;
      }
      pushLog('incomes', 'push', iCount, `${iCount} ingresos subidos a Firestore`);

      // 6. Expenses
      const expenses = await this.db.expense.findMany();
      let eCount = 0;
      for (const exp of expenses) {
        const docId = this.slugify(exp.id);
        await this.upsertDocument(projectId, 'expenses', docId, {
          concept: exp.concept,
          amount: exp.amount ?? 0,
          date: exp.date ?? '',
          category: exp.category ?? 'general',
          paymentMethod: exp.paymentMethod ?? 'efectivo',
          beneficiary: exp.beneficiary ?? '',
          notes: exp.notes ?? '',
          createdAt: exp.createdAt?.toISOString() ?? null,
        });
        eCount++;
      }
      pushLog('expenses', 'push', eCount, `${eCount} egresos subidos a Firestore`);

      const finishedAt = new Date().toISOString();
      this.saveState({
        lastSyncAt: finishedAt,
        lastSyncMode: 'live',
        lastSyncStatus: 'success',
        lastSyncDirection: 'push',
        counts: {
          committees: cCount,
          volunteers: vCount,
          activities: aCount,
          socialHours: hCount,
          incomes: iCount,
          expenses: eCount,
        },
        log,
      });

      return {
        success: true,
        startedAt,
        finishedAt,
        mode: 'live',
        counts: {
          committees: cCount,
          volunteers: vCount,
          activities: aCount,
          socialHours: hCount,
          incomes: iCount,
          expenses: eCount,
        },
        log,
      };
    } catch (e: any) {
      const finishedAt = new Date().toISOString();
      this.saveState({
        lastSyncAt: finishedAt,
        lastSyncMode: 'live',
        lastSyncStatus: 'error',
        lastSyncDirection: 'push',
        counts: { committees: 0, volunteers: 0, activities: 0, socialHours: 0, incomes: 0, expenses: 0 },
        log,
        error: e?.message ?? String(e),
      });
      return {
        success: false,
        startedAt,
        finishedAt,
        mode: 'live',
        counts: { committees: 0, volunteers: 0, activities: 0, socialHours: 0, incomes: 0, expenses: 0 },
        log,
        error: e?.message ?? String(e),
      };
    }
  }

  /** Convierte un string a un documentId válido para Firestore (alfanumérico, -, _). */
  private slugify(s: string): string {
    return String(s)
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 200) || 'doc';
  }

  /* ----------------------------- Test connection ----------------------------- */

  async testConnection(): Promise<{ success: boolean; message: string; projectId?: string }> {
    const config = this.getStoredConfig();
    if (config.mode === 'mock' || !config.projectId) {
      return {
        success: true,
        message: 'Modo demostración (mock) activo. No se requieren credenciales reales para sincronizar datos de ejemplo.',
      };
    }
    try {
      // Probamos listando la primera colección (committees) vía REST API
      const docs = await this.listDocuments(config.projectId, 'committees');
      return {
        success: true,
        message: `Conexión exitosa a Firestore. Colección 'committees': ${docs.length} documento(s).`,
        projectId: config.projectId,
      };
    } catch (e: any) {
      this.accessToken = null;
      this.tokenExpiry = 0;
      return {
        success: false,
        message: `Error de conexión: ${e?.message ?? String(e)}`,
      };
    }
  }

  /* ----------------------------- Sync (Firestore → Prisma) ----------------------------- */

  async syncAll(): Promise<SyncResult> {
    const config = this.getStoredConfig();
    const log: SyncLogEntry[] = [];
    const startedAt = new Date().toISOString();

    const pushLog = (collection: string, action: string, count: number, detail?: string) => {
      log.push({ collection, action, count, detail, timestamp: new Date().toISOString() });
    };

    try {
      // Choose data source: real Firestore or mock
      let rawData: any;
      const usingMock = config.mode === 'mock' || !config.projectId;
      if (usingMock) {
        pushLog('firebase', 'mock-mode', 0, 'Usando datos de demostración (mock Firestore)');
        rawData = MOCK_FIREBASE_DATA;
      } else {
        pushLog('firebase', 'live-mode', 0, `Conectado a proyecto ${config.projectId}`);
        rawData = await this.fetchFromFirestore();
      }

      // 1. Committees
      const committeesSynced = await this.syncCommittees(rawData.committees ?? [], pushLog);
      // 2. Volunteers
      const volunteersSynced = await this.syncVolunteers(rawData.volunteers ?? [], pushLog);
      // 3. Activities
      const activitiesSynced = await this.syncActivities(rawData.activities ?? [], pushLog);
      // 4. Social Hours
      const hoursSynced = await this.syncSocialHours(rawData.socialHours ?? [], pushLog);
      // 5. Incomes
      const incomesSynced = await this.syncIncomes(rawData.incomes ?? [], pushLog);
      // 6. Expenses
      const expensesSynced = await this.syncExpenses(rawData.expenses ?? [], pushLog);

      // === BIDIRECTIONAL SYNC: in live mode, also push local data TO Firestore ===
      // This creates/updates collections in the user's Firebase project so that
      // the data is visible in the Firebase console and available for other clients.
      let pushCounts = { committees: 0, volunteers: 0, activities: 0, socialHours: 0, incomes: 0, expenses: 0 };
      if (!usingMock) {
        pushLog('firebase', 'push-start', 0, 'Iniciando subida de datos locales a Firestore...');
        try {
          const pushResult = await this.pushLocalToFirestore();
          pushCounts = pushResult.counts;
          pushLog('firebase', 'push-done', Object.values(pushCounts).reduce((a, b) => a + b, 0),
            `${Object.values(pushCounts).reduce((a, b) => a + b, 0)} documentos subidos a Firestore`);
        } catch (e: any) {
          pushLog('firebase', 'push-error', 0, `Error al subir datos: ${e?.message ?? String(e)}`);
        }
      }

      const finishedAt = new Date().toISOString();
      this.saveState({
        lastSyncAt: finishedAt,
        lastSyncMode: usingMock ? 'mock' : 'live',
        lastSyncDirection: usingMock ? 'pull' : 'bidirectional',
        lastSyncStatus: 'success',
        counts: {
          committees: Math.max(committeesSynced, pushCounts.committees),
          volunteers: Math.max(volunteersSynced, pushCounts.volunteers),
          activities: Math.max(activitiesSynced, pushCounts.activities),
          socialHours: Math.max(hoursSynced, pushCounts.socialHours),
          incomes: Math.max(incomesSynced, pushCounts.incomes),
          expenses: Math.max(expensesSynced, pushCounts.expenses),
        },
        log,
      });

      return {
        success: true,
        startedAt,
        finishedAt,
        mode: usingMock ? 'mock' : 'live',
        direction: usingMock ? 'pull' : 'bidirectional',
        counts: {
          committees: Math.max(committeesSynced, pushCounts.committees),
          volunteers: Math.max(volunteersSynced, pushCounts.volunteers),
          activities: Math.max(activitiesSynced, pushCounts.activities),
          socialHours: Math.max(hoursSynced, pushCounts.socialHours),
          incomes: Math.max(incomesSynced, pushCounts.incomes),
          expenses: Math.max(expensesSynced, pushCounts.expenses),
        },
        pushed: usingMock ? null : pushCounts,
        log,
      };
    } catch (e: any) {
      const finishedAt = new Date().toISOString();
      const usingMock = config.mode === 'mock' || !config.projectId;
      this.saveState({
        lastSyncAt: finishedAt,
        lastSyncMode: usingMock ? 'mock' : 'live',
        lastSyncStatus: 'error',
        counts: { committees: 0, volunteers: 0, activities: 0, socialHours: 0, incomes: 0, expenses: 0 },
        log,
        error: e?.message ?? String(e),
      });
      return {
        success: false,
        startedAt,
        finishedAt,
        mode: usingMock ? 'mock' : 'live',
        counts: { committees: 0, volunteers: 0, activities: 0, socialHours: 0, incomes: 0, expenses: 0 },
        log,
        error: e?.message ?? String(e),
      };
    }
  }

  private async fetchFromFirestore(): Promise<any> {
    const config = this.getStoredConfig();
    if (!config.projectId) throw new Error('No hay projectId configurado');
    const result: any = {};
    for (const [key, colName] of Object.entries(COLLECTIONS)) {
      result[key] = await this.listDocuments(config.projectId, colName);
    }
    return result;
  }

  /* --------------------- Per-collection sync (upsert) --------------------- */

  private async syncCommittees(items: any[], log: (c: string, a: string, n: number, d?: string) => void): Promise<number> {
    let count = 0;
    for (const item of items) {
      const name = String(item.name ?? item.nombre ?? '').trim();
      if (!name) continue;
      await this.db.committee.upsert({
        where: { name },
        create: {
          name,
          description: String(item.description ?? item.descripcion ?? ''),
          color: String(item.color ?? 'emerald'),
        },
        update: {
          description: String(item.description ?? item.descripcion ?? ''),
          color: String(item.color ?? 'emerald'),
        },
      });
      count++;
    }
    log('committees', 'upsert', count, `${count} comités sincronizados`);
    return count;
  }

  private async syncVolunteers(items: any[], log: (c: string, a: string, n: number, d?: string) => void): Promise<number> {
    let count = 0;
    const committees = await this.db.committee.findMany();
    const committeeMap = new Map(committees.map((c) => [c.name, c.id]));
    for (const item of items) {
      const name = String(item.name ?? item.nombre ?? '').trim();
      const studentId = String(item.studentId ?? item.carnet ?? item.student_id ?? '').trim();
      if (!name || !studentId) continue;
      const committeeName = String(item.committee ?? item.comite ?? '').trim();
      const committeeId = committeeName ? (committeeMap.get(committeeName) ?? null) : null;
      const existing = await this.db.volunteer.findUnique({ where: { studentId } });
      if (existing) {
        await this.db.volunteer.update({
          where: { id: existing.id },
          data: {
            name,
            career: String(item.career ?? item.carrera ?? ''),
            email: String(item.email ?? ''),
            phone: String(item.phone ?? item.telefono ?? ''),
            role: (item.role === 'admin' ? 'admin' : 'volunteer') as any,
            committeeId,
          },
        });
      } else {
        await this.db.volunteer.create({
          data: {
            name,
            studentId,
            career: String(item.career ?? item.carrera ?? ''),
            email: String(item.email ?? ''),
            phone: String(item.phone ?? item.telefono ?? ''),
            password: String(item.password ?? '00000000'),
            role: (item.role === 'admin' ? 'admin' : 'volunteer') as any,
            committeeId,
          },
        });
      }
      count++;
    }
    log('volunteers', 'upsert', count, `${count} voluntarios sincronizados`);
    return count;
  }

  private async syncActivities(items: any[], log: (c: string, a: string, n: number, d?: string) => void): Promise<number> {
    let count = 0;
    const committees = await this.db.committee.findMany();
    const committeeMap = new Map(committees.map((c) => [c.name, c.id]));
    for (const item of items) {
      const title = String(item.title ?? item.titulo ?? '').trim();
      if (!title) continue;
      const committeeName = String(item.committee ?? item.comite ?? '').trim();
      const committeeId = committeeName ? (committeeMap.get(committeeName) ?? null) : null;
      let existing = await this.db.activity.findFirst({ where: { title } });
      const data = {
        title,
        description: String(item.description ?? item.descripcion ?? ''),
        type: String(item.type ?? item.tipo ?? 'EduTECH ESEN'),
        startDate: String(item.startDate ?? item.fechaInicio ?? ''),
        endDate: String(item.endDate ?? item.fechaFin ?? ''),
        location: String(item.location ?? item.ubicacion ?? ''),
        hours: Number(item.hours ?? item.horas ?? 0),
        beneficiariesMen: Number(item.beneficiariesMen ?? item.beneficiariosHombres ?? 0),
        beneficiariesWomen: Number(item.beneficiariesWomen ?? item.beneficiariosMujeres ?? 0),
        ods: Array.isArray(item.ods) ? item.ods.join(', ') : String(item.ods ?? ''),
        committeeId,
      };
      if (existing) {
        existing = await this.db.activity.update({ where: { id: existing.id }, data });
      } else {
        existing = await this.db.activity.create({ data });
      }
      // Sync participant volunteer links (by studentId/carnet)
      const participantIds = Array.isArray(item.volunteers ?? item.voluntarios)
        ? (item.volunteers ?? item.voluntarios)
        : [];
      if (participantIds.length > 0) {
        const linked = await this.db.volunteer.findMany({
          where: { studentId: { in: participantIds.map(String) } },
        });
        await this.db.activityVolunteer.deleteMany({ where: { activityId: existing.id } });
        for (const v of linked) {
          await this.db.activityVolunteer
            .create({ data: { activityId: existing.id, volunteerId: v.id } })
            .catch(() => {});
        }
      }
      count++;
    }
    log('activities', 'upsert', count, `${count} actividades sincronizadas`);
    return count;
  }

  private async syncSocialHours(items: any[], log: (c: string, a: string, n: number, d?: string) => void): Promise<number> {
    let count = 0;
    for (const item of items) {
      const studentId = String(item.studentId ?? item.carnet ?? item.volunteer ?? '').trim();
      const hours = Number(item.hours ?? item.horas ?? 0);
      if (!studentId) continue;
      const volunteer = await this.db.volunteer.findUnique({ where: { studentId } });
      if (!volunteer) continue;
      let activityId: string | null = null;
      const activityTitle = String(item.activityTitle ?? item.actividad ?? '').trim();
      if (activityTitle) {
        const act = await this.db.activity.findFirst({ where: { title: activityTitle } });
        if (act) activityId = act.id;
      }
      const date = String(item.date ?? item.fecha ?? '');
      const notes = String(item.notes ?? item.notas ?? '');
      const type = (item.type === 'admin' ? 'admin' : 'field') as any;
      // Avoid duplicate: same volunteer+date+hours+notes
      const dup = await this.db.socialHour.findFirst({
        where: { volunteerId: volunteer.id, date, hours, notes },
      });
      if (dup) continue;
      await this.db.socialHour.create({
        data: { volunteerId: volunteer.id, activityId, hours, type, date, notes },
      });
      count++;
    }
    log('socialHours', 'create', count, `${count} horas sociales sincronizadas`);
    return count;
  }

  private async syncIncomes(items: any[], log: (c: string, a: string, n: number, d?: string) => void): Promise<number> {
    let count = 0;
    for (const item of items) {
      const concept = String(item.concept ?? item.concepto ?? '').trim();
      const amount = Number(item.amount ?? item.monto ?? 0);
      if (!concept) continue;
      const date = String(item.date ?? item.fecha ?? '');
      const dup = await this.db.income.findFirst({ where: { date, concept } });
      if (dup) {
        await this.db.income.update({
          where: { id: dup.id },
          data: {
            amount,
            source: String(item.source ?? item.origen ?? ''),
            category: String(item.category ?? item.categoria ?? 'general'),
            notes: String(item.notes ?? item.notas ?? ''),
          },
        });
      } else {
        await this.db.income.create({
          data: {
            date,
            concept,
            amount,
            source: String(item.source ?? item.origen ?? ''),
            category: String(item.category ?? item.categoria ?? 'general'),
            notes: String(item.notes ?? item.notas ?? ''),
          },
        });
      }
      count++;
    }
    log('incomes', 'upsert', count, `${count} ingresos sincronizados`);
    return count;
  }

  private async syncExpenses(items: any[], log: (c: string, a: string, n: number, d?: string) => void): Promise<number> {
    let count = 0;
    for (const item of items) {
      const concept = String(item.concept ?? item.concepto ?? '').trim();
      const amount = Number(item.amount ?? item.monto ?? 0);
      if (!concept) continue;
      const date = String(item.date ?? item.fecha ?? '');
      const dup = await this.db.expense.findFirst({ where: { date, concept } });
      const data = {
        amount,
        category: String(item.category ?? item.categoria ?? 'general'),
        paymentMethod: String(item.paymentMethod ?? item.metodoPago ?? 'efectivo'),
        beneficiary: String(item.beneficiary ?? item.beneficiario ?? ''),
        notes: String(item.notes ?? item.notas ?? ''),
      };
      if (dup) {
        await this.db.expense.update({ where: { id: dup.id }, data });
      } else {
        await this.db.expense.create({ data: { date, concept, ...data } });
      }
      count++;
    }
    log('expenses', 'upsert', count, `${count} egresos sincronizados`);
    return count;
  }

  /* ----------------------------- Status / state ----------------------------- */

  getStatus(): any {
    const config = this.getStoredConfig();
    let state: any = { lastSyncAt: null, lastSyncMode: null, lastSyncStatus: 'idle', counts: {} };
    try {
      if (fs.existsSync(STATE_FILE)) {
        state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
      }
    } catch {
      /* ignore */
    }
    return {
      configured: Boolean(config.projectId && config.clientEmail && config.privateKey) || config.mode === 'mock',
      mode: config.mode === 'mock' || !config.projectId ? 'mock' : 'live',
      enabled: config.enabled,
      projectId: config.projectId || null,
      ...state,
    };
  }

  private saveState(state: any): void {
    ensureDataDir();
    try {
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
    } catch {
      /* ignore */
    }
  }
}
