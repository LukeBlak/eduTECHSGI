# Worklog — EduTECH ESEN

---
Task ID: FIX-1
Agent: main (Z.ai Code)
Task: Diagnosticar y arreglar errores 500 en producción (Vercel) para los endpoints `/api/volunteers/[id]/hours`, `/api/notifications`, `/api/social-hours`, `/api/social-hours?approvalStatus=pending`.

Work Log:
- Leí el reporte del usuario: 4 endpoints devuelven HTTP 500 en `edu-techsgi-f5mcdjv73-lukeblaks-projects.vercel.app`. El usuario también reportó que los voluntarios se guardan con UUID (no carnet) y que las horas sociales usan `studentId` (carnet) en vez de `volunteerId`.
- Análisis de las 2 capturas de pantalla subidas por el usuario (Firestore Console):
  - Screenshot 1: documento en `socialHours` con campos `studentId: "20241022"`, `volunteerName`, `activityTitle`, `hours`, `date`, `type` — formato LEGACY del mock-data.ts eliminado en FB-4c. NO tiene `volunteerId`, `activityId`, `approvalStatus`.
  - Screenshot 2: documento en `volunteers` con ID auto-generado `G6Pk9u808ip6LGomoGty` (UUID de Firestore, comportamiento correcto) y campos `studentId: "12345678"`, `name`, `role: "admin"`, etc.
- Revisión del código:
  - `social-hours.service.ts` ya guarda con `volunteerId` (línea 119), NO con `studentId`. Los docs legacy vienen del mock-data.ts eliminado.
  - `volunteers.service.ts` usa UUID auto-generado de Firestore como doc ID (correcto) y `studentId` como campo. El JWT usa el doc ID como `userId`. Esto es comportamiento correcto.
  - `volunteers.service.ts` `getHours(id)` (línea 188): `findAll('socialHours', { where: { volunteerId: id }, orderBy: { field: 'date', direction: 'desc' } })`.
  - `notifications.service.ts` `listForUser` (línea 51): `findAll('notifications', { where: { userId, read: false }, orderBy: { field: 'createdAt', direction: 'desc' }, limit })`.
  - `social-hours.service.ts` `list` (línea 98): `findAll('socialHours', { where: { volunteerId, approvalStatus }, orderBy: { field: 'date', direction: 'desc' } })`.
- Diagnóstico ROOT CAUSE: **Firestore requiere composite indexes (creados manualmente en la consola) para cualquier query que combine `where` en un campo + `orderBy` en OTRO campo diferente**. El código hace esto en 9 servicios (verificado con grep multiline). Firestore lanza `FirebaseError: The query requires an index...` → el try/catch del controller lo convierte en 500.
  - `/api/volunteers/{id}/hours` → where(volunteerId) + orderBy(date) → necesita index (volunteerId, date).
  - `/api/notifications` → where(userId, read) + orderBy(createdAt) → necesita index (userId, read, createdAt).
  - `/api/social-hours` → where(volunteerId) + orderBy(date) → necesita index.
  - `/api/social-hours?approvalStatus=pending` → where(approvalStatus) + orderBy(date) → necesita index.
- Implementación del fix en `src/lib/firestore-helpers.ts`:
  - Añadido helper `compareValues(a, b, direction)` que soporta números, strings (localeCompare, incluye fechas ISO), booleanos y null/undefined (van al final).
  - Modificada `findAll` para detectar cuando hay `where` + `orderBy` (`needsClientSideSort = hasWhere && hasOrderBy`):
    - En ese caso, NO aplica `orderBy` ni `limit` al query nativo de Firestore (solo el `where`).
    - Hace fetch de todos los docs que matchean el `where`.
    - Sort client-side con `Array.sort()` + `compareValues`.
    - Aplica `offset` y `limit` DESPUÉS del sort (para que el top-N sea correcto).
  - Si solo hay `orderBy` (sin `where`), usa el orderBy nativo de Firestore (single-field indexes son auto-creados, no requiere composite).
  - Si solo hay `where` (sin `orderBy`), usa el where nativo (equality filters no requieren composite).
  - Esto es seguro porque las colecciones de esta app son pequeñas (notifs por usuario ~50, horas por voluntario ~decenas, social-hours total ~cientos). Para colecciones grandes se recomendaría crear el composite index en la consola, pero no es el caso.
- Verificado que TODAS las queries Firestore pasan por el helper (grep de `.collection(`, `.where(`, `.orderBy(` muestra que solo `firestore-helpers.ts` las usa, excepto un health check simple sin where+orderBy en `health/route.ts`).
- Lint: `bun run lint` → 0 errores, 3 warnings preexistentes (unused eslint-disable en firebase.ts y health/route.ts, no relacionados).

Stage Summary:
- **Root cause**: Firestore composite index requirement para queries con `where` + `orderBy` en campos diferentes. No es un bug del código sino una limitación de Firestore que no se había manejado.
- **Fix aplicado**: `findAll` en `src/lib/firestore-helpers.ts` ahora hace sort client-side cuando hay `where` + `orderBy`, evitando requerir composite indexes. Afecta positivamente a los 9 servicios que usan este patrón.
- **Datos legacy**: los docs en `socialHours` con `studentId` (del mock-data.ts eliminado) son harmless — el query `where: { volunteerId: id }` no los matchea (no tienen `volunteerId`), así que son invisibles al código actual. El usuario puede limpiarlos re-ejecutando `/api/seed` si quiere.
- **UUIDs en volunteers**: comportamiento CORRECTO de Firestore. El doc ID es auto-generado (UUID), `studentId` se guarda como campo. El JWT usa el doc ID como `userId`. No es un bug.
- **Lint**: ✅ PASS (0 errores).
- **Endpoints afectados**: `/api/volunteers/[id]/hours`, `/api/notifications`, `/api/social-hours`, `/api/social-hours?approvalStatus=pending`, y cualquier otro que use `findAll` con `where+orderBy` (potencialmente también activities, classes, hour-requests, achievements, income, expenses, committees reports).
- **Próximo paso**: commit + push para que Vercel redespliegue, luego verificar con agent-browser que los 500s desaparecen.
