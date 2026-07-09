import { z } from 'zod';

/**
 * DTO de registro — un voluntario puede auto-registrarse.
 * Las validaciones se alinean con src/lib/validation.ts (frontend).
 *
 * IMPORTANTE: el comité es OBLIGATORIO — todo voluntario debe pertenecer
 * a uno de los comités existentes al registrarse.
 */
export const RegisterDto = z.object({
  name: z
    .string()
    .trim()
    .min(3, 'El nombre debe tener al menos 3 caracteres')
    .max(120, 'El nombre no puede exceder 120 caracteres')
    .regex(
      /^[A-Za-zÁÉÍÓÚÜáéíóúüÑñÄËÏÖÜäëïöüÇç'’.\-\s]+$/,
      'El nombre solo puede contener letras, espacios y acentos',
    )
    .refine((v) => v.includes(' '), {
      message: 'Ingresa tu nombre completo (nombre y apellido)',
    }),
  studentId: z
    .string()
    .regex(/^\d{8}$/, 'El carnet debe tener exactamente 8 dígitos numéricos'),
  career: z.string().min(1, 'La carrera es requerida'),
  committeeId: z
    .string()
    .min(1, 'Debes seleccionar un comité'),
  password: z
    .string()
    .min(6, 'La contraseña debe tener al menos 6 caracteres')
    .max(100, 'La contraseña es demasiado larga'),
  email: z
    .string()
    .trim()
    .max(120, 'El email es demasiado largo')
    .email('Ingresa un email válido')
    .optional()
    .or(z.literal('')),
  phone: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine(
      (v) => {
        if (!v || !v.trim()) return true; // opcional
        const digits = v.replace(/\D/g, '');
        return digits.length === 8 && /^[267]/.test(digits);
      },
      { message: 'El teléfono debe ser un número salvadoreño válido de 8 dígitos' },
    ),
});

export type RegisterInput = z.infer<typeof RegisterDto>;

/** DTO de inicio de sesión. */
export const LoginDto = z.object({
  studentId: z.string().min(1, 'El carnet es requerido'),
  password: z.string().min(1, 'La contraseña es requerida'),
});

export type LoginInput = z.infer<typeof LoginDto>;
