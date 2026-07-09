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
  admin,
} from "@/lib/firebase";
import type { firestore as firestoreNs } from "firebase-admin";

type Firestore = admin.firestore.Firestore;
type DocumentData = admin.firestore.DocumentData;
type WriteBatch = admin.firestore.WriteBatch;
type WhereFilterOp = firestoreNs.WhereFilterOp;

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
    throw new Error(
      "Firebase no está configurado. Establece FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL y FIREBASE_PRIVATE_KEY en las variables de entorno.",
    );
  }
  return fs;
}

/* ─── READ ──────────────────────────────────────────────────────── */

/**
 * Busca todos los docs de una colección, opcionalmente filtrados.
 * Retorna array plano (sin el ID dentro del doc — se añade como `id`).
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
  let q: admin.firestore.Query = fs.collection(COLLECTIONS[collection]);

  if (opts?.where) {
    for (const [field, condition] of Object.entries(opts.where)) {
      if (condition && typeof condition === "object" && "op" in (condition as any)) {
        const c = condition as { op: WhereFilterOp; value: unknown };
        q = q.where(field, c.op, c.value);
      } else {
        q = q.where(field, "==", condition);
      }
    }
  }

  if (opts?.orderBy) {
    q = q.orderBy(opts.orderBy.field, opts.orderBy.direction ?? "asc");
  }

  if (opts?.limit) {
    q = q.limit(opts.limit);
  }

  // offset se aplica después (Firestore no soporta offset nativo bien, se hace con startAfter en producción)
  const snap = await q.get();
  let results = snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) }));

  if (opts?.offset && opts.offset > 0) {
    results = results.slice(opts.offset);
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

/** Cuenta docs que cumplan un where. */
export async function count(
  collection: CollectionName,
  where?: WhereClause,
): Promise<number> {
  const fs = requireFs();
  let q: admin.firestore.Query = fs.collection(COLLECTIONS[collection]);
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
