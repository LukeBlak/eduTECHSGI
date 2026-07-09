import { z } from 'zod';

export const CreateCommitteeDto = z.object({
  name: z.string().min(2),
  description: z.string().optional().or(z.literal('')),
  color: z.string().optional().or(z.literal('')),
});

export const UpdateCommitteeDto = CreateCommitteeDto.partial();

export type CreateCommitteeInput = z.infer<typeof CreateCommitteeDto>;
export type UpdateCommitteeInput = z.infer<typeof UpdateCommitteeDto>;
