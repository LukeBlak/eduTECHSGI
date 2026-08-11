/**
 * Helpers HTTP compartidos para controladores.
 *
 * Todas las respuestas incluyen `Cache-Control: no-store, no-cache,
 * must-revalidate` para evitar que el navegador o CDN (Vercel) cachéen
 * datos que provienen de Firestore y pueden cambiar en cualquier momento.
 * Sin esto, la app puede mostrar actividades/voluntarios/comités que ya
 * fueron borrados de la base de datos (datos "fantasma").
 */
import { NextResponse } from 'next/server';
import { getFirebaseInitError } from '@/lib/firebase';

/** Headers anti-caché aplicados a TODAS las respuestas API. */
const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
} as const;

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: NO_CACHE_HEADERS });
}

export function created(data: unknown) {
  return NextResponse.json(data, { status: 201, headers: NO_CACHE_HEADERS });
}

export function badRequest(message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json(
    { success: false, message, ...extra },
    { status: 400, headers: NO_CACHE_HEADERS },
  );
}

export function unauthorized(message = 'No autorizado') {
  return NextResponse.json(
    { success: false, message },
    { status: 401, headers: NO_CACHE_HEADERS },
  );
}

export function forbidden(message = 'Prohibido') {
  return NextResponse.json(
    { success: false, message },
    { status: 403, headers: NO_CACHE_HEADERS },
  );
}

export function notFound(message = 'No encontrado') {
  return NextResponse.json(
    { success: false, message },
    { status: 404, headers: NO_CACHE_HEADERS },
  );
}

/**
 * Error 500 con contexto útil.
 * Si Firebase falló al inicializar, adjunta el motivo exacto para que el
 * frontend pueda mostrarlo (en vez de un "Error interno" genérico).
 */
export function serverError(message = 'Error interno del servidor', error?: unknown) {
  const firebaseError = getFirebaseInitError();
  return NextResponse.json(
    {
      success: false,
      message,
      ...(error ? { detail: String(error) } : {}),
      ...(firebaseError ? { firebaseError } : {}),
    },
    { status: 500, headers: NO_CACHE_HEADERS },
  );
}
