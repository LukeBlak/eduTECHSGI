import { NextResponse } from 'next/server';
import { isFirebaseConfigured, getFirebaseInitError, getFirestore } from '@/lib/firebase';

/**
 * Endpoint de diagnóstico público.
 * Útil para verificar la conexión a Firebase desde el navegador o curl:
 *   GET https://tu-dominio.vercel.app/api/health
 *
 * No expone secretos — solo dice si Firebase está configurado e inicializado.
 *
 * IMPORTANTE: capturamos el initError DESPUÉS de intentar getFirestore()
 * porque getFirestore() es el que dispara la inicialización real.
 * Si lo capturamos antes, tendríamos un valor stale.
 */
export async function GET() {
  const configured = isFirebaseConfigured();
  const preInitError = getFirebaseInitError();

  let firestoreOk = false;
  let pingError: string | null = null;
  let getFirestoreError: string | null = null;
  let fsInstance: unknown = null;

  // Intentar obtener la instancia de Firestore (esto dispara init si no se hizo)
  try {
    fsInstance = getFirestore();
  } catch (e) {
    getFirestoreError = e instanceof Error ? e.message : String(e);
  }

  // AHORA leemos el initError — puede haberse seteado durante getFirestore()
  const initError = getFirebaseInitError() ?? preInitError;

  // Si tenemos instancia, hacer ping real a Firestore
  if (fsInstance) {
    try {
      const fs = fsInstance as {
        collection: (name: string) => { limit: (n: number) => { get: () => Promise<unknown> } };
      };
      await fs.collection('_health_check').limit(1).get();
      firestoreOk = true;
    } catch (e) {
      pingError = e instanceof Error ? e.message : String(e);
    }
  }

  // Diagnóstico consolidado
  const allErrors = [initError, getFirestoreError, pingError].filter(Boolean);

  return NextResponse.json({
    status: firestoreOk ? 'ok' : 'error',
    firebase: {
      configured,
      projectId: process.env.FIREBASE_PROJECT_ID ? '✓ set' : '✗ missing',
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL ? '✓ set' : '✗ missing',
      privateKey: process.env.FIREBASE_PRIVATE_KEY
        ? `✓ set (${process.env.FIREBASE_PRIVATE_KEY.length} chars)`
        : '✗ missing',
      privateKeyBeginsCorrectly: process.env.FIREBASE_PRIVATE_KEY
        ? process.env.FIREBASE_PRIVATE_KEY.includes('BEGIN PRIVATE KEY')
        : false,
      privateKeyEndsCorrectly: process.env.FIREBASE_PRIVATE_KEY
        ? process.env.FIREBASE_PRIVATE_KEY.includes('END PRIVATE KEY')
        : false,
      initialized: !initError,
      initError,
      getFirestoreError,
      firestorePing: firestoreOk ? '✓ reachable' : '✗ failed',
      pingError,
      allErrors: allErrors.length > 0 ? allErrors : null,
    },
    jwt: {
      secret: process.env.JWT_SECRET ? '✓ set' : '✗ missing',
    },
    seed: {
      secret: process.env.SEED_SECRET ? '✓ set' : '✗ missing',
    },
    timestamp: new Date().toISOString(),
  });
}
