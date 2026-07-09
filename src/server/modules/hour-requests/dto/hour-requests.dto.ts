import { z } from 'zod';

export const CreateHourRequestDto = z.object({
  activityId: z.string().optional().nullable(),
  currentHours: z.number().min(0).default(0),
  requestedHours: z.number().min(0.5, 'Las horas solicitadas deben ser mayor a 0'),
  reason: z.string().min(3, 'Explica brevemente por qué solicitas más horas').max(500),
});

export const ReviewHourRequestDto = z.object({
  approvedHours: z.number().min(0).optional(),
  reviewNotes: z.string().optional().or(z.literal('')),
});

export type CreateHourRequestInput = z.infer<typeof CreateHourRequestDto>;
export type ReviewHourRequestInput = z.infer<typeof ReviewHourRequestDto>;
