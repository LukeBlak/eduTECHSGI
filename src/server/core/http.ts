/**
 * Helpers HTTP compartidos para controladores.
 */
import { NextResponse } from 'next/server';

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function created(data: unknown) {
  return NextResponse.json(data, { status: 201 });
}

export function badRequest(message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ success: false, message, ...extra }, { status: 400 });
}

export function unauthorized(message = 'No autorizado') {
  return NextResponse.json({ success: false, message }, { status: 401 });
}

export function forbidden(message = 'Prohibido') {
  return NextResponse.json({ success: false, message }, { status: 403 });
}

export function notFound(message = 'No encontrado') {
  return NextResponse.json({ success: false, message }, { status: 404 });
}

export function serverError(message = 'Error interno del servidor', error?: unknown) {
  return NextResponse.json(
    { success: false, message, ...(error ? { detail: String(error) } : {}) },
    { status: 500 }
  );
}
