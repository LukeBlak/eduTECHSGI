import { z } from 'zod';

/** Schema de configuración de Firebase (service account). */
export const FirebaseConfigSchema = z.object({
  projectId: z.string().default(''),
  clientEmail: z.string().default(''),
  privateKey: z.string().default(''),
  databaseUrl: z.string().default(''),
  enabled: z.boolean().default(false),
  mode: z.enum(['live', 'mock']).default('mock'),
});

export type FirebaseConfig = z.infer<typeof FirebaseConfigSchema>;

export interface SyncLogEntry {
  collection: string;
  action: string;
  count: number;
  detail?: string;
  timestamp: string;
}

export interface SyncResult {
  success: boolean;
  startedAt: string;
  finishedAt: string;
  mode: 'live' | 'mock';
  direction?: 'pull' | 'push' | 'bidirectional';
  counts: {
    committees: number;
    volunteers: number;
    activities: number;
    socialHours: number;
    incomes: number;
    expenses: number;
  };
  pushed?: {
    committees: number;
    volunteers: number;
    activities: number;
    socialHours: number;
    incomes: number;
    expenses: number;
  } | null;
  log: SyncLogEntry[];
  error?: string;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  projectId?: string;
}

export interface FirebaseStatus {
  configured: boolean;
  mode: 'live' | 'mock';
  enabled: boolean;
  projectId: string | null;
  lastSyncAt: string | null;
  lastSyncMode: 'live' | 'mock' | null;
  lastSyncStatus: 'idle' | 'success' | 'error';
  counts?: Record<string, number>;
  log?: SyncLogEntry[];
  error?: string;
}
