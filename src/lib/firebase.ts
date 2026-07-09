/**
 * Firebase Admin SDK — inicialización singleton.
 *
 * Lee las credenciales desde variables de entorno (configuradas en Vercel):
 *  - FIREBASE_PROJECT_ID
 *  - FIREBASE_CLIENT_EMAIL
 *  - FIREBASE_PRIVATE_KEY  (la clave privada PEM, con \n escapados)
 *  - FIREBASE_DATABASE_URL (opcional — solo si usas Realtime DB)
 *
 * Si las variables no están configuradas, `getFirestore()` retorna null
 * y los servicios deben degradar gracefully (modo demo / error claro).
 *
 * El singleton se cachea en globalThis para sobrevivir HMR en desarrollo
 * y las cold starts de Vercel serverless.
 */
import admin, { type ServiceAccount } from "firebase-admin";

const APP_NAME = "edutech-esen";

/** ¿Está Firebase configurado (credenciales presentes)? */
export function isFirebaseConfigured(): boolean {
  return !!(
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  );
}

/** Decodifica la private key PEM desde el formato env (con \n literales). */
function decodePrivateKey(raw: string): string {
  // En .env las newlines se guardan como "\n" literales.
  // Vercel las preserva, pero por seguridad normalizamos.
  return raw.replace(/\\n/g, "\n");
}

let initialized = false;

/** Inicializa la app de Firebase Admin (idempotente). */
function ensureInit(): admin.app.App | null {
  if (initialized) {
    try {
      return admin.app(APP_NAME);
    } catch {
      // fall through to re-init
    }
  }

  // Cache en globalThis para sobrevivir HMR / cold starts.
  const g = globalThis as unknown as { __firebaseApp?: admin.app.App };
  if (g.__firebaseApp) {
    initialized = true;
    return g.__firebaseApp;
  }

  if (!isFirebaseConfigured()) {
    return null;
  }

  const serviceAccount: ServiceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID!,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
    privateKey: decodePrivateKey(process.env.FIREBASE_PRIVATE_KEY!),
  };

  const app = admin.initializeApp(
    {
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    },
    APP_NAME,
  );

  g.__firebaseApp = app;
  initialized = true;
  return app;
}

/** Firestore singleton (o null si no está configurado). */
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
