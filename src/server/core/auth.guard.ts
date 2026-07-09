/**
 * Auth Guard — equivalente al JwtAuthGuard / RolesGuard de NestJS.
 *
 * Helpers para proteger handlers de API Next.js verificando el token JWT
 * en la cabecera `Authorization: Bearer <token>`.
 */
import { NextRequest } from 'next/server';
import { verifyToken, type AuthPayload, PRIVILEGED_ROLES, APPROVER_ROLES, type Role } from './jwt.util';

/** Extrae y verifica el usuario a partir de la request. Devuelve null si no hay sesión válida. */
export function getUserFromRequest(req: NextRequest): AuthPayload | null {
  const header = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!header) return null;
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  return verifyToken(token);
}

export interface AuthResult {
  ok: boolean;
  user: AuthPayload | null;
  status: number;
  body: Record<string, unknown>;
}

/** Verifica que haya sesión válida. Si no, devuelve una respuesta 401 lista para usar. */
export function requireAuth(req: NextRequest): AuthResult {
  const user = getUserFromRequest(req);
  if (!user) {
    return { ok: false, user: null, status: 401, body: { success: false, message: 'No autorizado' } };
  }
  return { ok: true, user, status: 200, body: {} };
}

/** Verifica sesión Y rol de administrador (backward-compat: admin = president-level). */
export function requireAdmin(req: NextRequest): AuthResult {
  const base = requireAuth(req);
  if (!base.ok) return base;
  if (!PRIVILEGED_ROLES.includes(base.user!.role)) {
    return { ok: false, user: null, status: 403, body: { success: false, message: 'Requiere rol administrador' } };
  }
  return base;
}

/**
 * Verifica sesión Y que el rol tenga acceso completo (presidente, vicepresidente,
 * líder de comité, admin). Es lo que reemplaza a `requireAdmin` para el sistema
 * de roles nuevo. Usar este para proteger rutas de finanzas y administración.
 */
export function requirePrivileged(req: NextRequest): AuthResult {
  return requireAdmin(req);
}

/**
 * Verifica sesión Y que el rol pueda aprobar horas sociales / solicitudes de horas.
 * Roles: presidente, vicepresidente, líder de comité, admin.
 */
export function requireApprover(req: NextRequest): AuthResult {
  const base = requireAuth(req);
  if (!base.ok) return base;
  if (!APPROVER_ROLES.includes(base.user!.role)) {
    return { ok: false, user: null, status: 403, body: { success: false, message: 'Requiere rol aprobador (líder/presidente/vice/admin)' } };
  }
  return base;
}

/** ¿Tiene este rol acceso completo (finanzas + admin)? */
export function isPrivilegedRole(role: Role | undefined | null): boolean {
  return !!role && PRIVILEGED_ROLES.includes(role);
}

/** ¿Puede este rol aprobar horas? */
export function canApproveHours(role: Role | undefined | null): boolean {
  return !!role && APPROVER_ROLES.includes(role);
}
