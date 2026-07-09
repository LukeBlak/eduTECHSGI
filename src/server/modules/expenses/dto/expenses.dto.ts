import { z } from 'zod';

export const CreateExpenseDto = z.object({
  date: z.string().optional().or(z.literal('')),
  concept: z.string().min(2, 'El concepto es requerido'),
  amount: z.number().min(0, 'El monto debe ser positivo'),
  category: z.string().optional().or(z.literal('')),
  paymentMethod: z.enum(['efectivo', 'transferencia', 'tarjeta', 'cheque']).default('efectivo'),
  beneficiary: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
  activityId: z.string().optional().nullable(),
});

export const UpdateExpenseDto = CreateExpenseDto.partial();

export type CreateExpenseInput = z.infer<typeof CreateExpenseDto>;
export type UpdateExpenseInput = z.infer<typeof UpdateExpenseDto>;
