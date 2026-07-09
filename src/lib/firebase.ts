/**
 * Firebase Admin SDK — inicialización singleton (API modular, robusta para Vercel).
 *
 * Lee las credenciales desde variables de entorno:
 *  - FIREBASE_PROJECT_ID
 *  - FIREBASE_CLIENT_EMAIL
 *  - FIREBASE_PRIVATE_KEY  (la clave PEM — acepta \n literales, newlines reales,
 *                           o comillas envolventes; se normaliza todo)
 *  - FIREBASE_DATABASE_URL (opcional)
 *
 * IMPORTANTE — Estrategia de carga modular:
 * Next.js 16 con Turbopack expone las exports modulares de firebase-admin
 * (initializeApp, cert, getApp desde 'firebase-admin/app') en vez del
 * namespace clásico. La API modular NO tiene app.firestore() — hay que
 * usar getFirestore(app) desde 'firebase-admin/firestore'.
 *
 * Cargamos explícitamente los 2 submódulos con eval('require') para
 * bypassar el bundler y obtener las exports modulares nativas.
 *
 * Errores de inicialización se guardan en `__firebaseInitError` para que
 * los servicios puedan devolver mensajes claros al frontend en vez de 500 genéricos.
 */
import type { ServiceAccount } from "firebase-admin";
import type { App as FirebaseApp, Firestore } from "firebase-admin/app";

/**
 * Carga un submódulo de firebase-admin bypassando el bundler con eval('require').
 * Ningún bundler puede analizar eval() estáticamente, así que en runtime
 * se usa el require real de Node.js y se carga el módulo CommonJS nativo.
 */
function loadModule<T>(moduleName: string): T {
  try {
    // eslint-disable-next-line no-eval
    const _require = eval("require") as NodeRequire;
    const mod = _require(moduleName);
    // Manejar envoltorio .default (bundler a veces envuelve)
    if (mod?.default && !mod.initializeApp && !mod.getFirestore) {
      return mod.default as T;
    }
    return mod as T;
  } catch (e) {
    console.error(`[Firebase] loadModule(${moduleName}) falló:`, e);
    throw new Error(`No se pudo cargar el módulo ${moduleName}: ${e}`);
  }
}

// Cargar los 2 submódulos necesarios con la API modular.
// Se cargan LAZY (al primer uso) para que si fallan, podamos capturar el error
// en vez de romper todo el proceso al importar el archivo.
interface AppModule {
  initializeApp: (
    config: { credential: unknown; databaseURL?: string },
    name?: string,
  ) => FirebaseApp;
  getApp: (name?: string) => FirebaseApp;
  getApps: () => FirebaseApp[];
  cert: (sa: ServiceAccount) => unknown;
  applicationDefault?: () => unknown;
  SDK_VERSION?: string;
}
interface FirestoreModule {
  getFirestore: (app?: FirebaseApp) => Firestore;
  initializeFirestore?: (app: FirebaseApp, settings: unknown) => Firestore;
}

let _appModule: AppModule | null = null;
let _firestoreModule: FirestoreModule | null = null;
let _moduleLoadError: string | null = null;

function getAppModule(): AppModule {
  if (_appModule) return _appModule;
  try {
    _appModule = loadModule<AppModule>("firebase-admin/app");
    return _appModule;
  } catch (e) {
    _moduleLoadError = e instanceof Error ? e.message : String(e);
    throw e;
  }
}

function getFirestoreModule(): FirestoreModule {
  if (_firestoreModule) return _firestoreModule;
  try {
    _firestoreModule = loadModule<FirestoreModule>("firebase-admin/firestore");
    return _firestoreModule;
  } catch (e) {
    _moduleLoadError = e instanceof Error ? e.message : String(e);
    throw e;
  }
}

const APP_NAME = "edutech-esen";

/** ¿Está Firebase configurado (credenciales presentes)? */
export function isFirebaseConfigured(): boolean {
  return !!(
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  );
}

/**
 * Decodifica la private key PEM desde el formato env.
 *
 * Vercel / .env pueden entregar la clave de varias formas:
 *  1. Con `\n` literales (lo más común al copiar del JSON de Firebase)
 *  2. Con newlines reales (si se pegó con saltos de línea)
 *  3. Envuelta en comillas dobles `"..."` (a veces Vercel las preserva)
 *  4. Con espacios al inicio/final
 */
function decodePrivateKey(raw: string): string {
  let key = raw.trim();

  // Quitar comillas envolventes si las hay.
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }

  // Convertir `\n` literales a newlines reales.
  if (key.includes("\\n")) {
    key = key.replace(/\\n/g, "\n");
  }

  // Validación mínima: debe contener los marcadores PEM.
  if (!key.includes("BEGIN PRIVATE KEY") || !key.includes("END PRIVATE KEY")) {
    throw new Error(
      "FIREBASE_PRIVATE_KEY no tiene formato PEM válido. " +
        "Debe contener '-----BEGIN PRIVATE KEY-----' y '-----END PRIVATE KEY-----'. " +
        "Verifica que copiaste el campo private_key completo del JSON de Firebase.",
    );
  }

  return key;
}

/** Error de inicialización cacheado (para mostrar al usuario, no 500 genérico). */
export function getFirebaseInitError(): string | null {
  const g = globalThis as unknown as { __firebaseInitError?: string };
  return g.__firebaseInitError ?? null;
}

/** Inicializa la app de Firebase Admin (idempotente). */
function ensureInit(): FirebaseApp | null {
  const g = globalThis as unknown as {
    __firebaseApp?: FirebaseApp;
    __firebaseInitError?: string;
  };

  // Ya inicializada exitosamente.
  if (g.__firebaseApp) {
    return g.__firebaseApp;
  }

  // Ya falló antes en esta cold start — no reintentes infinitamente.
  if (g.__firebaseInitError) {
    return null;
  }

  if (!isFirebaseConfigured()) {
    g.__firebaseInitError =
      "Firebase no está configurado. Faltan variables de entorno: " +
      "FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL y/o FIREBASE_PRIVATE_KEY. " +
      "Agrega las 3 en Vercel → Settings → Environment Variables.";
    console.error("[Firebase]", g.__firebaseInitError);
    return null;
  }

  try {
    // Cargar módulo lazy (lanza si no se puede cargar)
    const appModule = getAppModule();
    const privateKey = decodePrivateKey(process.env.FIREBASE_PRIVATE_KEY!);

    // Limpiar projectId y clientEmail: Vercel a veces incluye \n literales o
    // espacios al copiar/pegar desde el JSON de Firebase. Esto rompe la
    // conexión a Firestore con errores crípticos como:
    // "Metadata string value 'projects/\nXXX/databases/(default)' contains illegal characters"
    const cleanProjectId = process.env.FIREBASE_PROJECT_ID!
      .replace(/\\n/g, "")
      .replace(/\n/g, "")
      .replace(/\r/g, "")
      .trim();
    const cleanClientEmail = process.env.FIREBASE_CLIENT_EMAIL!
      .replace(/\\n/g, "")
      .replace(/\n/g, "")
      .replace(/\r/g, "")
      .trim();

    const serviceAccount: ServiceAccount = {
      projectId: cleanProjectId,
      clientEmail: cleanClientEmail,
      privateKey,
    };

    // Verificar que cert() esté disponible (API modular: admin.cert directo).
    if (typeof appModule.cert !== "function") {
      throw new Error(
        `appModule.cert no es función. Keys disponibles: [${Object.keys(appModule).join(", ")}]. ` +
          `Versión firebase-admin: ${appModule.SDK_VERSION ?? "desconocida"}.`,
      );
    }

    // ¿Ya existe una app con este nombre? (cold start reuse)
    let app: FirebaseApp;
    const existingApps = appModule.getApps();
    const existing = existingApps.find((a) => (a as { name?: string }).name === APP_NAME);
    if (existing) {
      app = existing;
    } else {
      app = appModule.initializeApp(
        {
          credential: appModule.cert(serviceAccount),
          databaseURL: process.env.FIREBASE_DATABASE_URL || undefined,
        },
        APP_NAME,
      );
    }

    g.__firebaseApp = app;
    console.log(
      "[Firebase] Inicializado OK — project:",
      process.env.FIREBASE_PROJECT_ID,
      "— SDK:",
      appModule.SDK_VERSION ?? "?",
    );
    return app;
  } catch (e) {
    g.__firebaseInitError =
      e instanceof Error ? e.message : "Error desconocido al inicializar Firebase";
    console.error("[Firebase] Error de inicialización:", g.__firebaseInitError);
    return null;
  }
}

/**
 * Firestore singleton (o null si no está configurado / falló init).
 * Usa la API modular: getFirestore(app) desde 'firebase-admin/firestore'.
 */
export function getFirestore(): Firestore | null {
  const app = ensureInit();
  if (!app) return null;

  const g = globalThis as unknown as {
    __firestore?: Firestore;
    __firebaseInitError?: string;
  };
  if (g.__firestore) return g.__firestore;

  try {
    // Cargar módulo lazy
    const firestoreModule = getFirestoreModule();
    // API modular: getFirestore(app) en vez de app.firestore()
    if (typeof firestoreModule.getFirestore !== "function") {
      throw new Error(
        `firestoreModule.getFirestore no es función. Keys: [${Object.keys(firestoreModule).join(", ")}].`,
      );
    }
    const fs = firestoreModule.getFirestore(app);
    // Configuración recomendada para Vercel serverless.
    try {
      fs.settings({ ignoreUndefinedProperties: true } as never);
    } catch {
      // settings ya aplicadas — ignorar.
    }
    g.__firestore = fs;
    return fs;
  } catch (e) {
    g.__firebaseInitError =
      "Error al obtener instancia de Firestore: " +
      (e instanceof Error ? e.message : String(e));
    console.error("[Firebase] getFirestore error:", g.__firebaseInitError);
    return null;
  }
}

/**
 * Auth de Firebase (si en el futuro migramos de JWT custom a Firebase Auth).
 * Usa la API modular: getAuth(app) desde 'firebase-admin/auth'.
 */
export function getAuth(): unknown | null {
  const app = ensureInit();
  if (!app) return null;
  try {
    const authModule = loadModule<{ getAuth: (app: FirebaseApp) => unknown }>(
      "firebase-admin/auth",
    );
    return authModule.getAuth(app);
  } catch (e) {
    console.error("[Firebase] getAuth error:", e);
    return null;
  }
}

// Re-export para compatibilidad con código existente que importa `admin`.
// Es un getter lazy para que no intente cargar módulos al importar el archivo.
export const admin = new Proxy(
  {},
  {
    get(_target, prop) {
      // Permite admin.firestore, admin.credential, admin.initializeApp, etc.
      try {
        const am = getAppModule();
        if (prop in am) return (am as never)[prop];
      } catch {
        /* noop */
      }
      try {
        const fm = getFirestoreModule();
        if (prop in fm) return (fm as never)[prop];
      } catch {
        /* noop */
      }
      if (prop === "firestore") return () => getFirestore();
      if (prop === "app") return () => ensureInit();
      return undefined;
    },
  },
);
export type { ServiceAccount };
