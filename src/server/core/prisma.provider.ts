/**
 * Provider de Prisma — equivalente a un PrismaModule de NestJS.
 * Reutiliza el singleton de `@/lib/db` y lo registra en el contenedor DI.
 */
import { db } from '@/lib/db';
import { provide } from './container';

export const PRISMA_TOKEN = 'PrismaService';

provide(PRISMA_TOKEN, () => db);

export type PrismaService = typeof db;
