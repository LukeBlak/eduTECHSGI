/**
 * Helpers de Firestore — utilidades CRUD genéricas para todos los servicios.
 *
 * Estos helpers abstraen los patrones comunes que usaban los servicios con Prisma:
 *  - findAll / findById / create / update / remove
 *  - where clauses simples (campo = valor, campo IN [...], etc.)
 *  - count
 *  - batchWrite (para createMany / updateMany / deleteMany)
 *  - conversión Date ↔ string (los timestamps se guardan como ISO string para
 *    simplicidad y compatibilidad con el frontend)
 */
import {
  getFirestore,
  getFirebaseInitError,
} from "@/lib/firebase";
import type {
  Firestore,
  DocumentData,
  WriteBatch,
  Query,
  WhereFilterOp,
} from "firebase-admin/firestore";

/**
 * Error claro cuando Firebase no está disponible.
 * Incluye el mensaje exacto de por qué falló la inicialización
 * (credenciales faltantes, private key mal formateada, etc.)
 * para que el frontend lo muestre en vez de un 500 genérico.
 */
export class FirebaseUnavailableError extends Error {
  constructor() {
    const reason = getFirebaseInitError();
    super(
      reason ??
        "Firebase no está disponible. Configura las credenciales en las variables de entorno.",
    );
    this.name = "FirebaseUnavailableError";
  }
}

/** Nombres de colecciones — espejo de los modelos Prisma. */
export const COLLECTIONS = {
  volunteers: "volunteers",
  committees: "committees",
  activities: "activities",
  activityVolunteers: "activityVolunteers",
  socialHours: "socialHours",
  hourRequests: "hourRequests",
  classes: "classes",
  classVolunteers: "classVolunteers",
  incomes: "incomes",
  expenses: "expenses",
  notifications: "notifications",
  achievements: "achievements",
  volunteerAchievements: "volunteerAchievements",
} as const;

export type CollectionName = keyof typeof COLLECTIONS;

/** Condición de filtro simple: { campo: valor } o { campo: { op, value } }. */
export type WhereClause = Record<
  string,
  | { op: WhereFilterOp; value: unknown }
  | unknown
>;

/** Genera un ID tipo cuid (compatible con los IDs existentes de Prisma). */
export function generateId(): string {
  // Firestore genera IDs lexicográficamente ordenados, lo cual es óptimo.
  // Usamos el ID autogenerado de Firestore.
  const fs = requireFs();
  return fs.collection("_id_gen").doc().id;
}

/** Lanza error claro si Firebase no está configurado. */
function requireFs(): Firestore {
  const fs = getFirestore();
  if (!fs) {
    throw new FirebaseUnavailableError();
  }
  return fs;
}

/* ─── READ ──────────────────────────────────────────────────────── */

/**
 * Compara dos valores para ordenamiento client-side.
 * Soporta strings (localeCompare), números, fechas ISO y null/undefined.
 * null/undefined se ordenan al final en `desc` y al inicio en `asc`.
 */
function compareValues(a: unknown, b: unknown, direction: "asc" | "desc" = "asc"): number {
  const mul = direction === "desc" ? -1 : 1;
  // null/undefined van al final siempre
  if (a == null && b == null) return 0;
  if (a == null) return 1; // a va después
  if (b == null) return -1; // b va después

  // Números
  if (typeof a === "number" && typeof b === "number") {
    return (a - b) * mul;
  }
  // Strings (incluye fechas ISO — orden lexicográfico == orden cronológico para ISO)
  if (typeof a === "string" && typeof b === "string") {
    return a.localeCompare(b) * mul;
  }
  // Booleanos
  if (typeof a === "boolean" && typeof b === "boolean") {
    return ((a ? 1 : 0) - (b ? 1 : 0)) * mul;
  }
  // Fallback: comparar como strings
  return String(a).localeCompare(String(b)) * mul;
}

/**
 * Aplica una condición where a un doc client-side.
 * Soporta equality (`==`), `in`, y `!=` (los ops que usamos en el código).
 * Los booleanos (como `read: false`) se comparan con `===` directamente.
 */
function matchesCondition(
  doc: Record<string, unknown>,
  field: string,
  condition: unknown,
): boolean {
  if (
    condition !== null &&
    condition !== undefined &&
    typeof condition === "object" &&
    "op" in (condition as { op: unknown })
  ) {
    const c = condition as { op: string; value: unknown };
    const val = doc[field];
    switch (c.op) {
      case "==":
        return val === c.value;
      case "in":
        return Array.isArray(c.value) && c.value.includes(val);
      case "!=":
        return val !== c.value;
      default:
        return val === c.value;
    }
  }
  return doc[field] === condition;
}

/**
 * Busca todos los docs de una colección, opcionalmente filtrados.
 * Retorna array plano (sin el ID dentro del doc — se añade como `id`).
 *
 * IMPORTANTE — Estrategia anti-composite-index:
 * Firestore REQUIERE composite indexes (creados manualmente en la consola)
 * para cualquier query que combine `where` en un campo + `orderBy` en OTRO
 * campo diferente. Como las colecciones de esta app son pequeñas (notifs
 * por usuario, horas por voluntario, etc.), hacemos el orderBy CLIENT-SIDE
 * cuando hay ambos. Esto evita 500s por missing index en producción.
 *
 * Si solo hay `orderBy` (sin where), usamos el orderBy nativo de Firestore
 * (single-field indexes son auto-creados).
 */
export async function findAll<T = DocumentData>(
  collection: CollectionName,
  opts?: {
    where?: WhereClause;
    orderBy?: { field: string; direction?: "asc" | "desc" };
    limit?: number;
    offset?: number;
  },
): Promise<(T & { id: string })[]> {
  const fs = requireFs();
  let q: Query = fs.collection(COLLECTIONS[collection]);

  const hasWhere = !!opts?.where && Object.keys(opts.where).length > 0;
  const hasOrderBy = !!opts?.orderBy;

  // QA-FIX-NOTIF-3: el fix anterior (QA-FIX-NOTIF-2) aplicaba el PRIMER
  // where al query nativo y filtraba el resto client-side. Pero Firestore
  // Admin SDK puede requerir composite index incluso para 1 where +
  // orderBy en campos diferentes. Para garantizar que funcione sin
  // importar los indexes disponibles, cuando hay 2+ where clauses
  // hacemos TODO client-side (sin where nativo, sin orderBy nativo).
  //
  // Estrategia:
  //  - 0 where clauses → query directo.
  //  - 1 where clause, sin orderBy → query nativo con ese where.
  //  - 1 where clause + orderBy en el mismo campo → orderBy nativo.
  //  - 1 where clause + orderBy en campo diferente → sin orderBy nativo,
  //    sort client-side.
  //  - 2+ where clauses → TODO client-side (trae todos, filtra, ordena).
  const whereEntries: [string, unknown][] = hasWhere
    ? Object.entries(opts!.where!)
    : [];

  const needsClientSideFilter = whereEntries.length > 1;
  // Si hay 2+ where clauses, no podemos usar orderBy nativo (no hay where
  // nativo para combinar). Si hay 1 where + orderBy en campos diferentes,
  // también evitamos orderBy nativo (requiere composite index).
  const needsClientSideSort =
    hasOrderBy && (needsClientSideFilter || (hasWhere && true));

  // Aplicar where nativo SOLO si hay exactamente 1 where clause.
  // Si hay 2+, no aplicamos ningún where nativo (todo client-side).
  if (whereEntries.length === 1) {
    const [firstField, firstCondition] = whereEntries[0];
    if (
      firstCondition &&
      typeof firstCondition === "object" &&
      "op" in (firstCondition as { op: unknown })
    ) {
      const c = firstCondition as { op: WhereFilterOp; value: unknown };
      q = q.where(firstField, c.op, c.value);
    } else {
      q = q.where(firstField, "==", firstCondition);
    }
  }

  // orderBy nativo solo si: hay orderBy, no hay where, o hay 1 where en
  // el mismo campo (raro). Para simplicidad: solo si no hay where.
  if (hasOrderBy && !needsClientSideSort && !hasWhere) {
    q = q.orderBy(opts!.orderBy!.field, opts!.orderBy!.direction ?? "asc");
  }

  // limit nativo solo si no vamos a filtrar/ordenar client-side.
  if (opts?.limit && !needsClientSideSort && !needsClientSideFilter) {
    q = q.limit(opts.limit);
  }

  const snap = await q.get();
  let results = snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) }));

  // QA-FIX-NOTIF-3: aplicar TODOS los where clauses client-side cuando hay
  // 2+ (en ese caso no se aplicó ningún where nativo).
  if (needsClientSideFilter) {
    results = results.filter((r) => {
      const doc = r as Record<string, unknown>;
      for (const [field, condition] of whereEntries) {
        if (!matchesCondition(doc, field, condition)) return false;
      }
      return true;
    });
  }

  // Sort client-side si where + orderBy (evita composite index).
  if (needsClientSideSort) {
    const { field, direction = "asc" } = opts!.orderBy!;
    results.sort((a, b) => {
      const av = (a as Record<string, unknown>)[field];
      const bv = (b as Record<string, unknown>)[field];
      return compareValues(av, bv, direction);
    });
  }

  // offset se aplica después del sort client-side.
  if (opts?.offset && opts.offset > 0) {
    results = results.slice(opts.offset);
  }

  // limit se aplica DESPUÉS del sort/filter client-side (para que el top-N sea correcto).
  if (opts?.limit && (needsClientSideSort || needsClientSideFilter)) {
    results = results.slice(0, opts.limit);
  }

  return results;
}

/** Busca un doc por ID. Retorna null si no existe. */
export async function findById<T = DocumentData>(
  collection: CollectionName,
  id: string,
): Promise<(T & { id: string }) | null> {
  const fs = requireFs();
  const snap = await fs.collection(COLLECTIONS[collection]).doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as T) };
}

/** Busca el primer doc que cumpla un where. Útil para lookups por campo único. */
export async function findOne<T = DocumentData>(
  collection: CollectionName,
  where: WhereClause,
): Promise<(T & { id: string }) | null> {
  const results = await findAll<T>(collection, { where, limit: 1 });
  return results[0] ?? null;
}

/**
 * Cuenta docs que cumplan un where.
 *
 * QA-FIX-NOTIF-1: Firestore Admin SDK requiere composite index para
 * queries con múltiples `.where()` en campos diferentes (ej: `userId`
 * + `read`). Como no podemos garantizar que todos los composite indexes
 * existan en producción, hacemos el count con `findAll` (que sortea
 * client-side) y devolvemos `.length`. Es ligeramente menos eficiente
 * para colecciones grandes, pero evita 500s por missing composite index
 * — las colecciones de esta app son pequeñas (notifs por usuario, horas
 * por voluntario, etc.), así que el overhead es despreciable.
 */
export async function count(
  collection: CollectionName,
  where?: WhereClause,
): Promise<number> {
  // Si solo hay 0 o 1 condición, podemos usar el count nativo de Firestore
  // (single-field index es auto-creado, no requiere composite).
  const fieldCount = where ? Object.keys(where).length : 0;
  if (fieldCount <= 1) {
    const fs = requireFs();
    let q: Query = fs.collection(COLLECTIONS[collection]);
    if (where) {
      for (const [field, condition] of Object.entries(where)) {
        if (condition && typeof condition === "object" && "op" in (condition as any)) {
          const c = condition as { op: WhereFilterOp; value: unknown };
          q = q.where(field, c.op, c.value);
        } else {
          q = q.where(field, "==", condition);
        }
      }
    }
    const snap = await q.count().get();
    return snap.data().count;
  }
  // 2+ condiciones → usar findAll (sortea client-side) para evitar
  // el requisito de composite index.
  const docs = await findAll(collection, { where });
  return docs.length;
}

/* ─── WRITE ─────────────────────────────────────────────────────── */

/**
 * Crea un doc. Si no se pasa `id`, se autogenera.
 * `createdAt` y `updatedAt` se añaden automáticamente si no están en `data`.
 */
export async function create<T = DocumentData>(
  collection: CollectionName,
  data: Partial<T>,
  id?: string,
): Promise<T & { id: string }> {
  const fs = requireFs();
  const docId = id ?? generateId();
  const now = new Date().toISOString();
  const payload = {
    ...data,
    createdAt: (data as any)?.createdAt ?? now,
    updatedAt: (data as any)?.updatedAt ?? now,
  };
  await fs.collection(COLLECTIONS[collection]).doc(docId).set(payload);
  return { id: docId, ...(payload as T) };
}

/** Actualiza un doc (merge). `updatedAt` se actualiza automáticamente. */
export async function update<T = DocumentData>(
  collection: CollectionName,
  id: string,
  data: Partial<T>,
): Promise<void> {
  const fs = requireFs();
  const payload = { ...data, updatedAt: new Date().toISOString() };
  await fs.collection(COLLECTIONS[collection]).doc(id).set(payload, { merge: true });
}

/** Upsert: crea si no existe, actualiza si existe. */
export async function upsert<T = DocumentData>(
  collection: CollectionName,
  id: string,
  data: Partial<T>,
): Promise<T & { id: string }> {
  const existing = await findById<T>(collection, id);
  if (existing) {
    await update<T>(collection, id, data);
    return { ...(existing as any), ...data, id } as T & { id: string };
  }
  return create<T>(collection, data, id);
}

/** Borra un doc por ID. */
export async function remove(collection: CollectionName, id: string): Promise<void> {
  const fs = requireFs();
  await fs.collection(COLLECTIONS[collection]).doc(id).delete();
}

/** Borra todos los docs que cumplan un where (usando batched writes). */
export async function deleteMany(
  collection: CollectionName,
  where?: WhereClause,
): Promise<number> {
  const fs = requireFs();
  const docs = await findAll(collection, { where });
  if (docs.length === 0) return 0;

  // Batched writes (máx 500 por batch)
  const batches: WriteBatch[] = [];
  let currentBatch = fs.batch();
  let opsInBatch = 0;

  for (const doc of docs) {
    currentBatch.delete(fs.collection(COLLECTIONS[collection]).doc(doc.id));
    opsInBatch++;
    if (opsInBatch >= 450) {
      batches.push(currentBatch);
      currentBatch = fs.batch();
      opsInBatch = 0;
    }
  }
  if (opsInBatch > 0) batches.push(currentBatch);

  await Promise.all(batches.map((b) => b.commit()));
  return docs.length;
}

/** Actualiza en lote todos los docs que cumplan un where. */
export async function updateMany(
  collection: CollectionName,
  where: WhereClause,
  data: Record<string, unknown>,
): Promise<number> {
  const fs = requireFs();
  const docs = await findAll(collection, { where });
  if (docs.length === 0) return 0;

  const payload = { ...data, updatedAt: new Date().toISOString() };
  const batches: WriteBatch[] = [];
  let currentBatch = fs.batch();
  let opsInBatch = 0;

  for (const doc of docs) {
    currentBatch.set(fs.collection(COLLECTIONS[collection]).doc(doc.id), payload, {
      merge: true,
    });
    opsInBatch++;
    if (opsInBatch >= 450) {
      batches.push(currentBatch);
      currentBatch = fs.batch();
      opsInBatch = 0;
    }
  }
  if (opsInBatch > 0) batches.push(currentBatch);

  await Promise.all(batches.map((b) => b.commit()));
  return docs.length;
}

/* ─── BATCH ATÓMICO ─────────────────────────────────────────────── */

/** Crea un batch para writes atómicos (máx 500 ops). */
export function batch(): WriteBatch {
  const fs = requireFs();
  return fs.batch();
}

/**
 * Atomic claim: transaccionalmente lee un doc y, si cumple el predicate,
 * aplica `update`. Retorna el doc actual (pre-update) y un flag `claimed`.
 *
 * Uso típico: prevenir doble-Complete de una actividad/clase.
 *
 *   const { claimed } = await atomicClaim('activities', id,
 *     (doc) => doc?.status === 'active',
 *     { status: 'completed', completedAt: now });
 *   if (!claimed) return alreadyCompleted;
 *
 * La transacción de Firestore garantiza que dos calls concurrentes solo
 * una vera `status === 'active'` y aplicará el update; la otra vera
 * `status === 'completed'` (post-update de la primera) y claim=false.
 */
export async function atomicClaim<T = DocumentData>(
  collection: CollectionName,
  id: string,
  predicate: (doc: (T & { id: string }) | null) => boolean,
  update: Partial<T>,
): Promise<{ claimed: boolean; doc: (T & { id: string }) | null }> {
  const fs = requireFs();
  const ref = fs.collection(COLLECTIONS[collection]).doc(id);
  let claimed = false;
  let result: (T & { id: string }) | null = null;

  await fs.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      result = null;
      return;
    }
    const doc = { id: snap.id, ...(snap.data() as T) };
    result = doc;
    if (predicate(doc)) {
      const nowIso = new Date().toISOString();
      tx.set(ref, { ...update, updatedAt: nowIso }, { merge: true });
      claimed = true;
    }
  });

  return { claimed, doc: result };
}

/* ─── UTILIDADES DE TIEMPO ──────────────────────────────────────── */

/** Convierte un Date a ISO string (para almacenar). */
export function toISO(date: Date | string | undefined): string | null {
  if (!date) return null;
  if (typeof date === "string") return date;
  return date.toISOString();
}

/** Convierte un ISO string a Date. */
export function fromDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  return new Date(iso);
}

/** Timestamp actual en ISO. */
export function now(): string {
  return new Date().toISOString();
}
