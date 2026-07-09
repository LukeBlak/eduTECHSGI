import { z } from 'zod';

export const CreateSocialHourDto = z.object({
  volunteerId: z.string().min(1),
  activityId: z.string().optional().nullable(),
  hours: z.number().min(0),
  type: z.enum(['admin', 'field']).default('field'),
  date: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
  /** Si true, se crea como pendiente de aprobación (lo crea el propio voluntario). */
  pendingApproval: z.boolean().optional(),
});

export const UpdateSocialHourDto = CreateSocialHourDto.partial().extend({
  approvalStatus: z.enum(['pending', 'approved', 'rejected']).optional(),
  rejectionReason: z.string().optional(),
});

export const ApproveSocialHourDto = z.object({
  rejectionReason: z.string().optional().or(z.literal('')),
});

export type CreateSocialHourInput = z.infer<typeof CreateSocialHourDto>;
export type UpdateSocialHourInput = z.infer<typeof UpdateSocialHourDto>;
export type ApproveSocialHourInput = z.infer<typeof ApproveSocialHourDto>;
