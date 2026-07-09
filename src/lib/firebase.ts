/**
 * Firebase Admin SDK — inicialización singleton (robusta para Vercel).
 *
 * Lee las credenciales desde variables de entorno:
 *  - FIREBASE_PROJECT_ID
 *  - FIREBASE_CLIENT_EMAIL
 *  - FIREBASE_PRIVATE_KEY  (la clave PEM — acepta \n literales, newlines reales,
 *                           o comillas envolventes; se normaliza todo)
 *  - FIREBASE_DATABASE_URL (opcional)
 *
 * El singleton se cachea en globalThis para sobrevivir HMR en desarrollo
 * y las cold starts de Vercel serverless.
 *
 * IMPORTANTE — Estrategia de carga del módulo:
 * firebase-admin es CommonJS puro. Turbopack (Next.js 16) transforma
 * `import` y `require` de forma que pierde la propiedad `admin.credential`.
 * Usamos `eval("require")` que NO puede ser analizado estáticamente por
 * ningún bundler, garantizando que en runtime se use el `require` real
 * de Node.js y se cargue el módulo CommonJS nativo.
 *
 * Además manejamos el caso donde el bundler envuelve el módulo en `.default`.
 *
 * Errores de inicialización se guardan en `__firebaseInitError` para que
 * los servicios puedan devolver mensajes claros al frontend en vez de 500 genéricos.
 */
import type { ServiceAccount } from "firebase-admin";
import type * as FirebaseAdminType from "firebase-admin";

/**
 * Carga firebase-admin bypassando el bundler.
 * Intenta múltiples estrategias para máxima compatibilidad.
 */
function loadFirebaseAdmin(): typeof FirebaseAdminType {
  // Estrategia 1: eval('require') — bypassa análisis estático del bundler.
  // Es la forma más robusta. Ningún bundler puede transformar eval().
  try {
    // eslint-disable-next-line no-eval, @typescript-eslint/no-implied-eval
    const _require = eval("require") as NodeRequire;
    const mod = _require("firebase-admin") as typeof FirebaseAdminType & {
      default?: typeof FirebaseAdminType;
    };
    // El módulo puede venir envuelto en .default según el bundler.
    if (mod && (mod as any).credential && typeof (mod as any).credential.cert === "function") {
      return mod;
    }
    if (mod?.default && (mod.default as any).credential) {
      return mod.default;
    }
    return mod;
  } catch (e) {
    console.error("[Firebase] eval('require') falló:", e);
  }

  // Estrategia 2: require directo (fallback — puede ser transformado por bundler)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("firebase-admin") as typeof FirebaseAdminType & {
      default?: typeof FirebaseAdminType;
    };
    if (mod && (mod as any).credential && typeof (mod as any).credential.cert === "function") {
      return mod;
    }
    if (mod?.default && (mod.default as any).credential) {
      return mod.default;
    }
    return mod;
  } catch (e) {
    console.error("[Firebase] require directo falló:", e);
  }

  // Estrategia 3: import dinámico (último recurso)
  // Esto es async pero como estamos en un contexto síncrono, lanzamos error.
  throw new Error(
    "No se pudo cargar firebase-admin. Intenta redeploy sin Build Cache en Vercel.",
  );
}

const admin = loadFirebaseAdmin();

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
 *
 * Esta función normaliza todo a un PEM válido que empiece con
 * `-----BEGIN PRIVATE KEY-----` y termine con `-----END PRIVATE KEY-----`.
 */
function decodePrivateKey(raw: string): string {
  let key = raw.trim();

  // Quitar comillas envolventes si las hay (pueden venir de .env o de Vercel).
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }

  // Convertir `\n` literales a newlines reales.
  // Si la clave ya tiene newlines reales, replace no hace nada (no hay `\n` literales).
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
function ensureInit(): admin.app.App | null {
  const g = globalThis as unknown as {
    __firebaseApp?: admin.app.App;
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
    const privateKey = decodePrivateKey(process.env.FIREBASE_PRIVATE_KEY!);

    const serviceAccount: ServiceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey,
    };

    // Verifica si ya existe una app con ese nombre (HMR / cold start reuse).
    let app: admin.app.App;
    try {
      app = admin.app(APP_NAME);
    } catch {
      // Guard defensivo: si `admin.credential` es undefined, significa que
      // firebase-admin se bundleificó incorrectamente. Da un error claro
      // con las keys disponibles para diagnóstico.
      if (!admin.credential || typeof admin.credential.cert !== "function") {
        const availableKeys = Object.keys(admin).slice(0, 20).join(", ");
        throw new Error(
          `firebase-admin se cargó pero admin.credential no está disponible. ` +
            `Keys encontradas en el módulo: [${availableKeys}]. ` +
            `Esto indica que el bundler transformó el módulo. ` +
            `Solución: en Vercel, Redeploy SIN "Use existing Build Cache".`,
        );
      }
      app = admin.initializeApp(
        {
          credential: admin.credential.cert(serviceAccount),
          databaseURL: process.env.FIREBASE_DATABASE_URL || undefined,
        },
        APP_NAME,
      );
    }

    g.__firebaseApp = app;
    console.log("[Firebase] Inicializado OK — project:", process.env.FIREBASE_PROJECT_ID);
    return app;
  } catch (e) {
    g.__firebaseInitError =
      e instanceof Error ? e.message : "Error desconocido al inicializar Firebase";
    console.error("[Firebase] Error de inicialización:", g.__firebaseInitError);
    return null;
  }
}

/** Firestore singleton (o null si no está configurado / falló init). */
export function getFirestore(): admin.firestore.Firestore | null {
  const app = ensureInit();
  if (!app) return null;

  const g = globalThis as unknown as {
    __firestore?: admin.firestore.Firestore;
    __firebaseInitError?: string;
  };
  if (g.__firestore) return g.__firestore;

  try {
    const fs = app.firestore();
    // Configuración recomendada para Vercel serverless.
    // settings() puede lanzar si ya fueron aplicadas (hot reload / cold start reuse).
    try {
      fs.settings({ ignoreUndefinedProperties: true });
    } catch {
      // settings ya aplicadas — ignorar, no es un error real.
    }
    g.__firestore = fs;
    return fs;
  } catch (e) {
    // Si app.firestore() falla, registramos el error para diagnóstico.
    g.__firebaseInitError =
      "Error al obtener instancia de Firestore: " +
      (e instanceof Error ? e.message : String(e));
    console.error("[Firebase] getFirestore error:", g.__firebaseInitError);
    return null;
  }
}

/** Auth de Firebase (si en el futuro migramos de JWT custom a Firebase Auth). */
export function getAuth(): admin.auth.Auth | null {
  const app = ensureInit();
  return app ? app.auth() : null;
}

export { admin };
export type { ServiceAccount };
