import { NextResponse } from 'next/server';
import { isFirebaseConfigured, getFirebaseInitError, getFirestore } from '@/lib/firebase';

/**
 * Endpoint de diagnóstico público.
 * Útil para verificar la conexión a Firebase desde el navegador o curl:
 *   GET https://tu-dominio.vercel.app/api/health
 *
 * No expone secretos — solo dice si Firebase está configurado e inicializado.
 */
export async function GET() {
  const configured = isFirebaseConfigured();
  const initError = getFirebaseInitError();

  let firestoreOk = false;
  let pingError: string | null = null;

  if (configured && !initError) {
    try {
      const fs = getFirestore();
      if (fs) {
        // Hace un get() a una colección inexistente — solo verifica conectividad.
        await fs.collection('_health_check').limit(1).get();
        firestoreOk = true;
      }
    } catch (e) {
      pingError = e instanceof Error ? e.message : String(e);
    }
  }

  return NextResponse.json({
    status: firestoreOk ? 'ok' : 'error',
    firebase: {
      configured,
      projectId: process.env.FIREBASE_PROJECT_ID ? '✓ set' : '✗ missing',
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL ? '✓ set' : '✗ missing',
      privateKey: process.env.FIREBASE_PRIVATE_KEY
        ? `✓ set (${process.env.FIREBASE_PRIVATE_KEY.length} chars)`
        : '✗ missing',
      initialized: !initError,
      initError,
      firestorePing: firestoreOk ? '✓ reachable' : '✗ failed',
      pingError,
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
