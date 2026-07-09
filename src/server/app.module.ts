/**
 * AppModule — módulo raíz de la aplicación.
 * Importa todos los módulos de características, lo que registra sus providers
 * y controladores en el contenedor DI (estilo NestJS).
 *
 * Para añadir un nuevo módulo: crearlo en `src/server/modules/<feature>/` y
 * agregar su import aquí.
 */
import '@/server/core/prisma.provider';

// Módulos de infraestructura (cargar primero: otros módulos dependen de ellos)
import '@/server/modules/notifications/notifications.module';

// Módulos de características
import '@/server/modules/auth/auth.module';
import '@/server/modules/volunteers/volunteers.module';
import '@/server/modules/committees/committees.module';
import '@/server/modules/activities/activities.module';
import '@/server/modules/social-hours/social-hours.module';
import '@/server/modules/hour-requests/hour-requests.module';
import '@/server/modules/classes/classes.module';
import '@/server/modules/income/income.module';
import '@/server/modules/expenses/expenses.module';
import '@/server/modules/achievements/achievements.module';
import '@/server/modules/dashboard/dashboard.module';
import '@/server/modules/reports/reports.module';
import '@/server/modules/firebase/firebase.module';

export const AppReady = true;
