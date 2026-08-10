/**
 * Sanitización de documentos antes de enviarlos al cliente.
 *
 * Por defecto, los servicios usan `{ ...doc }` para añadir relaciones
 * (committee, volunteer, etc.), lo que propaga TODOS los campos del
 * doc — incluyendo `password` (hash de bcrypt). Este helper stripsea
 * los campos sensibles para que nunca lleguen al frontend.
 */

type WithPassword = { password?: string };

/**
 * Stripsea el campo `password` de un doc de voluntario.
 * Retorna un nuevo objeto sin el campo password.
 */
export function sanitizeVolunteer<T extends WithPassword>(
  v: T | null | undefined,
): Omit<T, 'password'> | null {
  if (!v) return null;
  const { password: _pw, ...rest } = v;
  return rest as Omit<T, 'password'>;
}
