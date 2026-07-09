import { z } from 'zod';

export const CreateIncomeDto = z.object({
  date: z.string().optional().or(z.literal('')),
  concept: z.string().min(2),
  amount: z.number().min(0),
  source: z.string().optional().or(z.literal('')),
  category: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
});

export const UpdateIncomeDto = CreateIncomeDto.partial();

export type CreateIncomeInput = z.infer<typeof CreateIncomeDto>;
export type UpdateIncomeInput = z.infer<typeof UpdateIncomeDto>;
