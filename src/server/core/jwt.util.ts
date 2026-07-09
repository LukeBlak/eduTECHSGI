/**
 * Utilidades JWT — firma y verificación de tokens.
 * Equivalente al JwtService de NestJS.
 */
import jwt, { type JwtPayload } from 'jsonwebtoken';

/**
 * Secreto para firmar/verificar tokens JWT.
 *
 * En producción (Vercel): OBLIGATORIO configurar `JWT_SECRET`. Si no está,
 * el módulo crashea al cargar (fail-closed) — surfaces la mala configuración
 * inmediatamente en lugar de firmar tokens con un secreto hardcodeado.
 *
 * En desarrollo: si falta `JWT_SECRET`, usa un fallback hardcodeado para
 * conveniencia del sandbox.
 */
const SECRET = (() => {
  const s = process.env.JWT_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'JWT_SECRET no está configurado. Establécelo en las variables de entorno de Vercel.',
      );
    }
    // Dev-only fallback
    return 'edutech-esen-dev-secret-change-in-prod';
  }
  return s;
})();
const EXPIRES_IN = '7d';

export type Role = 'admin' | 'volunteer' | 'committee_leader' | 'president' | 'vice_president';

/** Roles con acceso completo (incluyendo finanzas y aprobación de horas). */
export const PRIVILEGED_ROLES: Role[] = ['admin', 'committee_leader', 'president', 'vice_president'];

/** Roles que pueden aprobar / rechazar horas sociales y solicitudes de horas. */
export const APPROVER_ROLES: Role[] = ['admin', 'committee_leader', 'president', 'vice_president'];

export interface AuthPayload extends JwtPayload {
  userId: string;
  studentId: string;
  role: Role;
  name: string;
}

export function signToken(payload: Omit<AuthPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN } as jwt.SignOptions);
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, SECRET) as AuthPayload;
  } catch {
    return null;
  }
}

export const JWT_SECRET = SECRET;
