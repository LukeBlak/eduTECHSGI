/**
 * Provider de Firestore — reemplaza al anterior PrismaProvider.
 * Registra los helpers de Firestore en el contenedor DI.
 *
 * Los servicios que antes hacían `inject(PRISMA_TOKEN)` ahora hacen
 * `inject(FIRESTORE_TOKEN)` y obtienen el módulo de helpers.
 */
import { provide } from './container';
import * as firestoreHelpers from '@/lib/firestore-helpers';

export const FIRESTORE_TOKEN = 'FirestoreService';

provide(FIRESTORE_TOKEN, () => firestoreHelpers);

export type FirestoreService = typeof firestoreHelpers;
