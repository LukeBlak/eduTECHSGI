import { NextResponse } from 'next/server';

/**
 * Endpoint de diagnóstico público (versión bulletproof).
 * Captura TODOS los errores posibles, incluyendo los que ocurren
 * al importar firebase-admin (antes de que el route handler se ejecute).
 */
export async function GET() {
  const diagnostics: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    env: {
      hasProjectId: !!process.env.FIREBASE_PROJECT_ID,
      hasClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
      hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
      privateKeyLength: process.env.FIREBASE_PRIVATE_KEY?.length ?? 0,
      // Mostrar projectId raw y limpio para detectar \n fantasma
      projectIdRaw: process.env.FIREBASE_PROJECT_ID
        ? JSON.stringify(process.env.FIREBASE_PROJECT_ID)
        : null,
      projectIdClean: process.env.FIREBASE_PROJECT_ID
        ? JSON.stringify(
            process.env.FIREBASE_PROJECT_ID
              .replace(/\\n/g, '')
              .replace(/\n/g, '')
              .replace(/\r/g, '')
              .trim(),
          )
        : null,
      clientEmailRaw: process.env.FIREBASE_CLIENT_EMAIL
        ? JSON.stringify(process.env.FIREBASE_CLIENT_EMAIL)
        : null,
      hasJwt: !!process.env.JWT_SECRET,
      hasSeed: !!process.env.SEED_SECRET,
      nodeVersion: typeof process !== 'undefined' ? process.version : 'unknown',
    },
  };

  // Paso 1: ¿Podemos importar firebase-admin con require normal?
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fa = require('firebase-admin');
    diagnostics.firebaseAdminRequire = {
      success: true,
      keys: Object.keys(fa).slice(0, 30),
      hasCredential: !!fa.credential,
      hasCert: typeof fa.credential?.cert === 'function' || typeof fa.cert === 'function',
      hasInitializeApp: typeof fa.initializeApp === 'function',
      sdkVersion: fa.SDK_VERSION ?? null,
    };
  } catch (e) {
    diagnostics.firebaseAdminRequire = {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  // Paso 2: ¿Podemos cargar con eval('require')?
  try {
    // eslint-disable-next-line no-eval
    const _require = eval('require') as NodeRequire;
    const fa = _require('firebase-admin');
    diagnostics.firebaseAdminEvalRequire = {
      success: true,
      keys: Object.keys(fa).slice(0, 30),
      hasCredential: !!fa.credential,
      hasCert: typeof fa.credential?.cert === 'function' || typeof fa.cert === 'function',
    };
  } catch (e) {
    diagnostics.firebaseAdminEvalRequire = {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  // Paso 3: ¿Podemos cargar los submódulos modulares?
  try {
    // eslint-disable-next-line no-eval
    const _require = eval('require') as NodeRequire;
    const appModule = _require('firebase-admin/app');
    const firestoreModule = _require('firebase-admin/firestore');
    diagnostics.modularImports = {
      success: true,
      appKeys: Object.keys(appModule).slice(0, 20),
      firestoreKeys: Object.keys(firestoreModule).slice(0, 20),
      hasInitializeApp: typeof appModule.initializeApp === 'function',
      hasCert: typeof appModule.cert === 'function',
      hasGetFirestore: typeof firestoreModule.getFirestore === 'function',
    };
  } catch (e) {
    diagnostics.modularImports = {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  // Paso 4: Intentar inicializar Firebase con try/catch robusto
  try {
    // Import dinámico para que si falla, no rompa todo el route
    const { isFirebaseConfigured, getFirebaseInitError, getFirestore } = await import(
      '@/lib/firebase'
    );
    diagnostics.firebaseLib = {
      loaded: true,
      isConfigured: isFirebaseConfigured(),
      preInitError: getFirebaseInitError(),
    };

    // Intentar obtener Firestore
    let fsInstance: unknown = null;
    try {
      fsInstance = getFirestore();
    } catch (e) {
      diagnostics.firebaseLib.getFirestoreError = e instanceof Error ? e.message : String(e);
    }

    diagnostics.firebaseLib.postInitError = getFirebaseInitError();
    diagnostics.firebaseLib.hasInstance = !!fsInstance;

    // Si tenemos instancia, hacer ping
    if (fsInstance) {
      try {
        const fs = fsInstance as {
          collection: (n: string) => { limit: (n: number) => { get: () => Promise<unknown> } };
        };
        await fs.collection('_health_check').limit(1).get();
        diagnostics.firebaseLib.ping = '✓ reachable';
        diagnostics.status = 'ok';
      } catch (e) {
        diagnostics.firebaseLib.pingError = e instanceof Error ? e.message : String(e);
        diagnostics.status = 'error';
      }
    } else {
      diagnostics.status = 'error';
    }
  } catch (e) {
    diagnostics.firebaseLib = {
      loaded: false,
      error: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack?.split('\n').slice(0, 5).join('\n') : null,
    };
    diagnostics.status = 'error';
  }

  return NextResponse.json(diagnostics);
}
