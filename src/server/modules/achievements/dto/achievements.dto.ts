import { z } from 'zod';

export const AchievementTierDto = z.enum(['bronze', 'silver', 'gold', 'platinum']);
export const AutoCriteriaTypeDto = z.enum([
  'none',
  'hours_total',
  'field_hours',
  'admin_hours',
  'activities_count',
  'classes_count',
  'social_records',
  'first_activity',
  'hours_milestone_50',
  'hours_milestone_100',
]);

export const CreateAchievementDto = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(120),
  description: z.string().max(800).optional().or(z.literal('')),
  icon: z.string().max(60).optional().or(z.literal('')),
  color: z.string().max(40).optional().or(z.literal('')),
  tier: AchievementTierDto.optional(),
  points: z.number().int().min(0).max(100000).optional(),
  auto: z.boolean().optional(),
  autoType: AutoCriteriaTypeDto.optional(),
  autoThreshold: z.number().min(0).optional(),
  active: z.boolean().optional(),
  repeatable: z.boolean().optional(),
});

export const UpdateAchievementDto = CreateAchievementDto.partial();

export const GrantAchievementDto = z.object({
  volunteerId: z.string().min(1, 'Se requiere un voluntario'),
  notes: z.string().max(500).optional().or(z.literal('')),
});

export const RevokeAchievementDto = z.object({
  volunteerId: z.string().min(1, 'Se requiere un voluntario'),
});

export type CreateAchievementInput = z.infer<typeof CreateAchievementDto>;
export type UpdateAchievementInput = z.infer<typeof UpdateAchievementDto>;
export type GrantAchievementInput = z.infer<typeof GrantAchievementDto>;
export type RevokeAchievementInput = z.infer<typeof RevokeAchievementDto>;
