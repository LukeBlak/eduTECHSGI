import { z } from 'zod';

export const CreateActivityDto = z.object({
  title: z.string().min(3),
  description: z.string().optional().or(z.literal('')),
  /** Objetivos específicos del proyecto (para Memoria de Labores). */
  objectives: z.string().optional().or(z.literal('')),
  /** Impacto esperado/obtenido del proyecto (para Memoria de Labores). */
  impact: z.string().optional().or(z.literal('')),
  type: z.string().optional().or(z.literal('')),
  startDate: z.string().optional().or(z.literal('')),
  endDate: z.string().optional().or(z.literal('')),
  location: z.string().optional().or(z.literal('')),
  hours: z.number().min(0).default(0),
  /** Tipo de horas que se asignan al finalizar la actividad. */
  hourType: z.enum(['admin', 'field']).optional().default('field'),
  capacity: z.number().int().min(1).optional().nullable(), // cupo máximo (null = ilimitado)
  beneficiariesMen: z.number().int().min(0).default(0),
  beneficiariesWomen: z.number().int().min(0).default(0),
  ods: z.array(z.string()).optional().default([]), // se guarda como string separado por comas
  committeeId: z.string().optional().nullable(),
  volunteerIds: z.array(z.string()).optional().default([]),
});

export const UpdateActivityDto = CreateActivityDto.partial();

export type CreateActivityInput = z.infer<typeof CreateActivityDto>;
export type UpdateActivityInput = z.infer<typeof UpdateActivityDto>;
