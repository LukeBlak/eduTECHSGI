import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Detecta si el schema cambió (regeneración) y descarta el singleton obsoleto.
const SCHEMA_VERSION = 'v2-expenses'
const globalForMeta = globalThis as unknown as { __prismaSchemaVersion?: string }
if (globalForMeta.__prismaSchemaVersion !== SCHEMA_VERSION) {
  if (globalForPrisma.prisma) {
    globalForPrisma.prisma.$disconnect?.().catch(() => {})
  }
  globalForPrisma.prisma = undefined
  globalForMeta.__prismaSchemaVersion = SCHEMA_VERSION
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db