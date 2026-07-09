import { z } from 'zod';

export const CreateClassDto = z.object({
  title: z.string().min(3),
  date: z.string().optional().or(z.literal('')),
  durationHours: z.number().min(0).default(1),
  school: z.string().optional().or(z.literal('')),
  topic: z.string().optional().or(z.literal('')),
  description: z.string().optional().or(z.literal('')),
  committeeId: z.string().optional().nullable(),
  instructorIds: z.array(z.string()).optional().default([]),
});

export const UpdateClassDto = CreateClassDto.partial();

export type CreateClassInput = z.infer<typeof CreateClassDto>;
export type UpdateClassInput = z.infer<typeof UpdateClassDto>;
