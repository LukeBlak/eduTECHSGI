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
 * Errores de inicialización se guardan en `__firebaseInitError` para que
 * los servicios puedan devolver mensajes claros al frontend en vez de 500 genéricos.
 */
import * as admin from "firebase-admin";
import type { ServiceAccount } from "firebase-admin";

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
      // firebase-admin se bundleificó incorrectamente (falta serverExternalPackages
      // en next.config). Da un error claro en vez de "Cannot read properties of undefined".
      if (!admin.credential || typeof admin.credential.cert !== "function") {
        throw new Error(
          "firebase-admin no se cargó correctamente en el runtime. " +
            "Esto suele ocurrir cuando Next.js bundleifica el módulo. " +
            "Verifica que next.config.ts tenga serverExternalPackages: ['firebase-admin']. " +
            "Si ya lo tiene, reconstruye el deployment en Vercel sin Build Cache.",
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

  const g = globalThis as unknown as { __firestore?: admin.firestore.Firestore };
  if (g.__firestore) return g.__firestore;

  const fs = app.firestore();
  // Configuración recomendada para Vercel serverless.
  fs.settings({ ignoreUndefinedProperties: true });
  g.__firestore = fs;
  return fs;
}

/** Auth de Firebase (si en el futuro migramos de JWT custom a Firebase Auth). */
export function getAuth(): admin.auth.Auth | null {
  const app = ensureInit();
  return app ? app.auth() : null;
}

export { admin };
export type { ServiceAccount };
