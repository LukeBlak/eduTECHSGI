import { z } from 'zod';

/** Roles válidos en el sistema. */
export const ROLE_VALUES = [
  'admin',
  'volunteer',
  'committee_leader',
  'president',
  'vice_president',
] as const;

export const CreateVolunteerDto = z.object({
  name: z.string().min(3),
  studentId: z.string().regex(/^\d{8}$/, 'Carnet de 8 dígitos'),
  career: z.string().min(1),
  committeeId: z.string().optional().nullable(),
  role: z.enum(ROLE_VALUES).default('volunteer'),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  password: z.string().min(6).optional(), // opcional al crear desde admin
});

export const UpdateVolunteerDto = z.object({
  name: z.string().min(3).optional(),
  career: z.string().optional(),
  committeeId: z.string().optional().nullable(),
  role: z.enum(ROLE_VALUES).optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  password: z.string().min(6).optional(),
});

export type CreateVolunteerInput = z.infer<typeof CreateVolunteerDto>;
export type UpdateVolunteerInput = z.infer<typeof UpdateVolunteerDto>;
