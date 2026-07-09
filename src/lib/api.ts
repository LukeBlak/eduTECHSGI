/**
 * API helper — centraliza fetch al backend NestJS-style montado en /api.
 * Añade Authorization: Bearer <token> cuando existe token en localStorage/sessionStorage.
 *
 * Soporta "Recuérdame":
 *  - remember = true  → token persiste en localStorage (sobrevive cerrar el navegador)
 *  - remember = false → token en sessionStorage (se borra al cerrar la pestaña/navegador)
 */

const TOKEN_KEY = "edutech_token";
const REMEMBER_KEY = "edutech_remember";

/** ¿El usuario marcó "Recuérdame" en su último login? Por defecto, sí. */
export function getRememberMe(): boolean {
  if (typeof window === "undefined") return true;
  const raw = window.localStorage.getItem(REMEMBER_KEY);
  return raw === null ? true : raw === "1";
}

/** Establece la preferencia "Recuérdame". Se guarda siempre en localStorage. */
export function setRememberMe(value: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(REMEMBER_KEY, value ? "1" : "0");
}

/** Recupera el token de cualquiera de los dos almacenes (localStorage tiene prioridad). */
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return (
    window.localStorage.getItem(TOKEN_KEY) ??
    window.sessionStorage.getItem(TOKEN_KEY)
  );
}

/** Guarda (o elimina) el token en el almacén adecuado según la preferencia "Recuérdame". */
export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  const usePersistent = getRememberMe();
  if (token) {
    if (usePersistent) {
      window.localStorage.setItem(TOKEN_KEY, token);
      window.sessionStorage.removeItem(TOKEN_KEY);
    } else {
      window.sessionStorage.setItem(TOKEN_KEY, token);
      window.localStorage.removeItem(TOKEN_KEY);
    }
  } else {
    window.localStorage.removeItem(TOKEN_KEY);
    window.sessionStorage.removeItem(TOKEN_KEY);
  }
}

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

interface FetchOptions extends RequestInit {
  /** Si true, no añade Authorization header (para login/register/seed). */
  noAuth?: boolean;
  /** Si true, devuelve la respuesta cruda sin parsear JSON. */
  raw?: boolean;
}

export async function fetchApi<T = unknown>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const url = path.startsWith("/api") ? path : `/api${path}`;
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;
  if (!isFormData && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  if (!options.noAuth) {
    const token = getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (options.raw) {
    if (!res.ok) {
      throw new ApiError(
        `Error ${res.status} en ${path}`,
        res.status,
      );
    }
    return res as unknown as T;
  }

  const text = await res.text();
  const data = text ? safeParse(text) : null;

  if (!res.ok) {
    const message =
      (data && typeof data === "object" && "message" in data
        ? String((data as { message: unknown }).message)
        : null) ??
      (data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : null) ??
      `Error ${res.status}`;
    throw new ApiError(message, res.status, data);
  }

  return data as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/* ============ Types ============ */

export type Role =
  | "admin"
  | "volunteer"
  | "committee_leader"
  | "president"
  | "vice_president";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrador",
  volunteer: "Voluntario",
  committee_leader: "Líder de Comité",
  president: "Presidente",
  vice_president: "Vicepresidente",
};

export const ROLE_BADGE_COLORS: Record<Role, string> = {
  admin: "bg-primary/15 text-primary border-primary/30",
  volunteer: "bg-muted text-muted-foreground border-border",
  committee_leader: "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800",
  president: "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  vice_president: "bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800",
};

/** Roles con acceso completo (finanzas + admin). */
export const PRIVILEGED_ROLES: Role[] = [
  "admin",
  "committee_leader",
  "president",
  "vice_president",
];

/** Roles que pueden aprobar horas sociales y solicitudes de horas. */
export const APPROVER_ROLES: Role[] = [
  "admin",
  "committee_leader",
  "president",
  "vice_president",
];

export function isPrivileged(role: Role | undefined | null): boolean {
  return !!role && PRIVILEGED_ROLES.includes(role);
}

export function canApproveHours(role: Role | undefined | null): boolean {
  return !!role && APPROVER_ROLES.includes(role);
}

export type HourType = "admin" | "field";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type HourRequestStatus = "pending" | "approved" | "rejected";
export type SubscriptionStatus = "registered" | "waitlist" | "cancelled";
export type CommitteeColor = "emerald" | "graphite" | "rose" | "sky" | "violet";

export interface Committee {
  id: string;
  name: string;
  description?: string;
  color: CommitteeColor | string;
  _count?: { members: number; activities: number; classes: number };
}

export interface Volunteer {
  id: string;
  name: string;
  studentId: string;
  career: string;
  email?: string;
  phone?: string;
  role: Role;
  committeeId?: string | null;
  committee?: Committee | null;
  createdAt?: string;
}

/**
 * Carreras oficiales de la asociación (ESEN).
 * Se usan tanto en el formulario de voluntarios (admin) como en el
 * formulario de auto-registro del LoginScreen, para mantener un único
 * origen de verdad y evitar desincronías.
 */
export const CAREERS = [
  "Ingeniería de Software y Negocios Digitales (ISND)",
  "Ingeniería de Negocios (IDN)",
  "Licenciatura de Economía y Negocios (LEN)",
  "Licenciatura de Ciencias Jurídicas (LCJ)",
] as const;

export type Career = (typeof CAREERS)[number];

/**
 * Extrae la abreviatura de una carrera ESEN (el texto entre paréntesis).
 * Ej: "Ingeniería de Software y Negocios Digitales (ISND)" → "ISND"
 * Si la carrera no tiene paréntesis, devuelve las iniciales en mayúsculas
 * como fallback (ej: "Administración" → "ADM"). Nunca devuelve vacío.
 */
export function careerShort(career: string | null | undefined): string {
  if (!career || !career.trim()) return "N/D";
  const match = career.match(/\(([^)]+)\)/);
  if (match) return match[1].trim().toUpperCase();
  // Fallback: tomar primeras letras de cada palabra (hasta 4)
  const initials = career
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return initials || career.trim().slice(0, 4).toUpperCase();
}

/**
 * Devuelve el nombre completo de la carrera a partir de cualquier valor
 * (abreviatura o nombre completo). Útil para tooltips y vistas de detalle.
 */
export function careerFull(career: string | null | undefined): string {
  if (!career || !career.trim()) return "Sin carrera";
  // Si ya es una carrera oficial completa, devolver tal cual
  if ((CAREERS as readonly string[]).includes(career)) return career;
  // Si es una abreviatura conocida, mapear al nombre completo
  const byAbbr: Record<string, string> = {
    ISND: "Ingeniería de Software y Negocios Digitales (ISND)",
    IDN: "Ingeniería de Negocios (IDN)",
    LEN: "Licenciatura de Economía y Negocios (LEN)",
    LCJ: "Licenciatura de Ciencias Jurídicas (LCJ)",
  };
  const upper = career.trim().toUpperCase();
  if (byAbbr[upper]) return byAbbr[upper];
  // Si tiene paréntesis, ya es un nombre completo no oficial
  return career;
}

export type AuthUser = Volunteer;

export interface AuthResponse {
  success: boolean;
  message: string;
  user: AuthUser;
  token: string;
}

export interface VerifyResponse {
  valid: boolean;
  user?: {
    userId: string;
    studentId: string;
    role: Role;
    name: string;
  };
}

export interface Activity {
  id: string;
  title: string;
  description?: string;
  objectives?: string;
  impact?: string;
  type?: string;
  startDate?: string;
  endDate?: string;
  location?: string;
  hours: number;
  hourType?: HourType;
  capacity?: number | null;
  status?: "active" | "completed";
  completedAt?: string | null;
  beneficiariesMen: number;
  beneficiariesWomen: number;
  ods: string[];
  committeeId?: string | null;
  committee?: Committee | null;
  volunteers?: (Volunteer & { subscriptionStatus?: SubscriptionStatus })[];
  registeredCount?: number;
  available?: number | null;
  capacityFull?: boolean;
  _count?: { volunteers: number };
}

/** Actividad con datos relacionados cargados (endpoint GET /activities/:id). */
export interface ActivityDetail extends Activity {
  socialHours?: (SocialHour & { volunteer?: Pick<Volunteer, "id" | "name" | "studentId"> })[];
}

export interface SocialHour {
  id: string;
  volunteerId: string;
  volunteer?: Pick<Volunteer, "id" | "name" | "studentId">;
  activityId?: string | null;
  activity?: Pick<Activity, "id" | "title"> | null;
  hours: number;
  type: HourType;
  date?: string;
  notes?: string;
  approvalStatus?: ApprovalStatus;
  reviewerId?: string | null;
  reviewer?: Pick<Volunteer, "id" | "name"> | null;
  reviewedAt?: string | null;
  rejectionReason?: string;
}

export interface HourRequest {
  id: string;
  volunteerId: string;
  volunteer?: Pick<Volunteer, "id" | "name" | "studentId" | "committee">;
  activityId?: string | null;
  activity?: Pick<Activity, "id" | "title"> | null;
  currentHours: number;
  requestedHours: number;
  approvedHours?: number | null;
  reason: string;
  status: HourRequestStatus;
  reviewerId?: string | null;
  reviewer?: Pick<Volunteer, "id" | "name"> | null;
  reviewNotes?: string;
  reviewedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface VolunteerHours {
  totalHours: number;
  adminHours: number;
  fieldHours: number;
  pendingHours?: number;
  rejectedHours?: number;
  records: SocialHour[];
  byActivity: {
    activityId: string;
    title: string;
    hours: number;
    type: string;
  }[];
}

export interface ClassItem {
  id: string;
  title: string;
  date?: string;
  durationHours: number;
  school?: string;
  topic?: string;
  description?: string;
  status?: "active" | "completed";
  completedAt?: string | null;
  committeeId?: string | null;
  committee?: Committee | null;
  instructors?: Volunteer[];
}

export interface Income {
  id: string;
  date?: string;
  concept: string;
  amount: number;
  source?: string;
  category?: string;
  notes?: string;
  createdAt?: string;
}

export interface IncomeSummary {
  total: number;
  count: number;
  byCategory: { category: string; amount: number }[];
}

export type PaymentMethod = "efectivo" | "transferencia" | "tarjeta" | "cheque";

export interface Expense {
  id: string;
  date?: string;
  concept: string;
  amount: number;
  category?: string;
  paymentMethod?: PaymentMethod | string;
  beneficiary?: string;
  notes?: string;
  activityId?: string | null;
  activity?: Pick<Activity, "id" | "title"> | null;
  createdAt?: string;
}

export interface ExpenseSummary {
  total: number;
  count: number;
  byCategory: { category: string; amount: number }[];
  byPaymentMethod: { method: string; amount: number }[];
}

export interface DashboardData {
  totalVolunteers: number;
  totalCommittees: number;
  totalActivities: number;
  totalClasses: number;
  totalHours: number;
  adminHours: number;
  fieldHours: number;
  totalIncome: number;
  totalExpenses: number;
  balance: number;
  hoursByCommittee: {
    name: string;
    color: string;
    hours: number;
    adminHours: number;
    fieldHours: number;
    members: number;
  }[];
  hoursByType: { name: string; value: number; color: string }[];
  topVolunteers: {
    id: string;
    name: string;
    studentId: string;
    committee: string;
    totalHours: number;
  }[];
  recentActivities: {
    id: string;
    title: string;
    startDate?: string;
    endDate?: string;
    committee: string;
    volunteers: number;
    ods: string[];
  }[];
  financeByMonth: {
    label: string;
    key: string;
    income: number;
    expense: number;
    balance: number;
  }[];
  hoursByMonth: {
    label: string;
    key: string;
    admin: number;
    field: number;
    total: number;
  }[];
  expensesByCategory: { category: string; amount: number }[];
  incomesByCategory: { category: string; amount: number }[];
  kpis: {
    avgHoursPerVolunteer: number;
    goalAchievementPct: number;
    volunteersWithGoal: number;
    volunteersWithHours: number;
    monthlyGrowthPct: number;
    newVolunteersThisMonth: number;
    newVolunteersLastMonth: number;
    totalBeneficiaries: number;
  };
}

/* ============ Auth ============ */

export const authApi = {
  login: (body: { studentId: string; password: string }) =>
    fetchApi<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
      noAuth: true,
    }),
  register: (body: {
    name: string;
    studentId: string;
    career: string;
    committeeId: string;
    password: string;
    email?: string;
    phone?: string;
  }) =>
    fetchApi<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
      noAuth: true,
    }),
  verify: () => fetchApi<VerifyResponse>("/auth/verify"),
  seed: () =>
    fetchApi<{ success: boolean; message: string }>("/seed", {
      method: "POST",
      noAuth: true,
    }),
};

/* ============ Volunteers ============ */

export const volunteersApi = {
  list: () => fetchApi<Volunteer[]>("/volunteers"),
  get: (id: string) =>
    fetchApi<Volunteer & {
      socialHours?: SocialHour[];
      activityLinks?: { activity: Activity }[];
      classLinks?: { class: ClassItem }[];
    }>(`/volunteers/${id}`),
  hours: (id: string) => fetchApi<VolunteerHours>(`/volunteers/${id}/hours`),
  create: (body: {
    name: string;
    studentId: string;
    career: string;
    committeeId?: string;
    role?: Role;
    email?: string;
    phone?: string;
    password?: string;
  }) => fetchApi<Volunteer>("/volunteers", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: Partial<{
    name: string;
    career: string;
    committeeId?: string | null;
    role: Role;
    email: string;
    phone: string;
    password: string;
  }>) => fetchApi<Volunteer>(`/volunteers/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  remove: (id: string) => fetchApi<{ success: boolean }>(`/volunteers/${id}`, { method: "DELETE" }),
};

/* ============ Committees ============ */

export const committeesApi = {
  list: () => fetchApi<Committee[]>("/committees"),
  get: (id: string) => fetchApi<Committee & { members?: Volunteer[]; activities?: Activity[]; classes?: ClassItem[] }>(`/committees/${id}`),
  members: (id: string) => fetchApi<Volunteer[]>(`/committees/${id}/members`),
  create: (body: { name: string; description?: string; color?: string }) =>
    fetchApi<Committee>("/committees", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: Partial<{ name: string; description: string; color: string }>) =>
    fetchApi<Committee>(`/committees/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  remove: (id: string) => fetchApi<{ success: boolean }>(`/committees/${id}`, { method: "DELETE" }),
};

/* ============ Activities ============ */

export const activitiesApi = {
  list: () => fetchApi<Activity[]>("/activities"),
  get: (id: string) => fetchApi<ActivityDetail>(`/activities/${id}`),
  mine: () => fetchApi<(Activity & { subscriptionStatus: SubscriptionStatus; subscribedAt: string })[]>("/activities/mine"),
  create: (body: {
    title: string;
    description?: string;
    objectives?: string;
    impact?: string;
    type?: string;
    startDate?: string;
    endDate?: string;
    location?: string;
    hours: number;
    hourType?: HourType;
    capacity?: number | null;
    beneficiariesMen: number;
    beneficiariesWomen: number;
    ods: string[];
    committeeId?: string | null;
    volunteerIds: string[];
  }) => fetchApi<Activity>("/activities", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: Partial<{
    title: string;
    description: string;
    objectives: string;
    impact: string;
    type: string;
    startDate: string;
    endDate: string;
    location: string;
    hours: number;
    hourType?: HourType;
    capacity?: number | null;
    beneficiariesMen: number;
    beneficiariesWomen: number;
    ods: string[];
    committeeId?: string | null;
    volunteerIds: string[];
  }>) => fetchApi<Activity>(`/activities/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  remove: (id: string) => fetchApi<{ success: boolean }>(`/activities/${id}`, { method: "DELETE" }),
  subscribe: (id: string) =>
    fetchApi<{
      success: boolean;
      message: string;
      status: SubscriptionStatus | "already";
      activityId: string;
      volunteerId: string;
      registeredCount: number;
      capacity: number | null;
      available: number | null;
    }>(`/activities/${id}/subscribe`, { method: "POST" }),
  unsubscribe: (id: string) =>
    fetchApi<{
      success: boolean;
      message: string;
      status: SubscriptionStatus | "already";
      activityId: string;
      volunteerId: string;
      registeredCount: number;
      capacity: number | null;
      available: number | null;
    }>(`/activities/${id}/unsubscribe`, { method: "POST" }),
  /** Finaliza la actividad y asigna las horas a los inscritos automáticamente. */
  complete: (id: string) =>
    fetchApi<{
      success: boolean;
      message: string;
      activityId: string;
      title: string;
      hoursPerVolunteer: number;
      hourType: HourType;
      assignedCount: number;
      skipped: { volunteerId: string; reason: string }[];
      alreadyCompleted: boolean;
    }>(`/activities/${id}/complete`, { method: "POST" }),
};

/* ============ Social Hours ============ */

export const socialHoursApi = {
  list: (volunteerId?: string, approvalStatus?: ApprovalStatus) =>
    fetchApi<SocialHour[]>(`/social-hours${volunteerId ? `?volunteerId=${volunteerId}` : ""}${approvalStatus ? `${volunteerId ? "&" : "?"}approvalStatus=${approvalStatus}` : ""}`),
  create: (body: {
    volunteerId: string;
    activityId?: string | null;
    hours: number;
    type: HourType;
    date?: string;
    notes?: string;
    pendingApproval?: boolean;
  }) => fetchApi<SocialHour>("/social-hours", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: Partial<{
    volunteerId: string;
    activityId?: string | null;
    hours: number;
    type: HourType;
    date: string;
    notes: string;
  }>) => fetchApi<SocialHour>(`/social-hours/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  approve: (id: string) =>
    fetchApi<SocialHour>(`/social-hours/${id}/approve`, { method: "POST" }),
  reject: (id: string, rejectionReason?: string) =>
    fetchApi<SocialHour>(`/social-hours/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ rejectionReason: rejectionReason || "" }),
    }),
  remove: (id: string) => fetchApi<{ success: boolean }>(`/social-hours/${id}`, { method: "DELETE" }),
};

/* ============ Hour Requests ============ */

export const hourRequestsApi = {
  list: (status?: HourRequestStatus) =>
    fetchApi<HourRequest[]>(`/hour-requests${status ? `?status=${status}` : ""}`),
  mine: () => fetchApi<HourRequest[]>(`/hour-requests/mine`),
  create: (body: {
    activityId?: string | null;
    currentHours: number;
    requestedHours: number;
    reason: string;
  }) => fetchApi<HourRequest>("/hour-requests", { method: "POST", body: JSON.stringify(body) }),
  approve: (id: string, approvedHours?: number) =>
    fetchApi<HourRequest>(`/hour-requests/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ approvedHours }),
    }),
  reject: (id: string, reviewNotes?: string) =>
    fetchApi<HourRequest>(`/hour-requests/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reviewNotes: reviewNotes || "" }),
    }),
};

/* ============ Classes ============ */

export const classesApi = {
  list: () => fetchApi<ClassItem[]>("/classes"),
  create: (body: {
    title: string;
    date?: string;
    durationHours: number;
    school?: string;
    topic?: string;
    description?: string;
    committeeId?: string | null;
    instructorIds: string[];
  }) => fetchApi<ClassItem>("/classes", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: Partial<{
    title: string;
    date: string;
    durationHours: number;
    school: string;
    topic: string;
    description: string;
    committeeId?: string | null;
    instructorIds: string[];
  }>) => fetchApi<ClassItem>(`/classes/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  remove: (id: string) => fetchApi<{ success: boolean }>(`/classes/${id}`, { method: "DELETE" }),
  /** Finaliza la clase y asigna las horas (durationHours) a cada instructor. */
  complete: (id: string) =>
    fetchApi<{
      success: boolean;
      message: string;
      classId: string;
      title: string;
      hoursPerInstructor: number;
      assignedCount: number;
      skipped: { volunteerId: string; reason: string }[];
      alreadyCompleted: boolean;
    }>(`/classes/${id}/complete`, { method: "POST" }),
};

/* ============ Income ============ */

export const incomeApi = {
  list: () => fetchApi<Income[]>("/incomes"),
  summary: () => fetchApi<IncomeSummary>("/incomes/summary"),
  create: (body: {
    date?: string;
    concept: string;
    amount: number;
    source?: string;
    category?: string;
    notes?: string;
  }) => fetchApi<Income>("/incomes", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: Partial<{
    date: string;
    concept: string;
    amount: number;
    source: string;
    category: string;
    notes: string;
  }>) => fetchApi<Income>(`/incomes/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  remove: (id: string) => fetchApi<{ success: boolean }>(`/incomes/${id}`, { method: "DELETE" }),
};

/* ============ Expenses ============ */

export const expenseApi = {
  list: () => fetchApi<Expense[]>("/expenses"),
  summary: () => fetchApi<ExpenseSummary>("/expenses/summary"),
  create: (body: {
    date?: string;
    concept: string;
    amount: number;
    category?: string;
    paymentMethod?: PaymentMethod;
    beneficiary?: string;
    notes?: string;
    activityId?: string | null;
  }) => fetchApi<Expense>("/expenses", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: Partial<{
    date: string;
    concept: string;
    amount: number;
    category: string;
    paymentMethod: PaymentMethod;
    beneficiary: string;
    notes: string;
    activityId?: string | null;
  }>) => fetchApi<Expense>(`/expenses/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  remove: (id: string) => fetchApi<{ success: boolean }>(`/expenses/${id}`, { method: "DELETE" }),
};

/* ============ Dashboard ============ */

export const dashboardApi = {
  stats: () => fetchApi<DashboardData>("/dashboard"),
};

/* ============ Reports ============ */

/** Filtro de rango de meses (formato YYYY-MM, ambos inclusive). */
export interface PeriodFilter {
  startMonth?: string;
  endMonth?: string;
}

/** Construye el query string de período para una URL de reporte. */
function periodQuery(period?: PeriodFilter): string {
  if (!period || (!period.startMonth && !period.endMonth)) return "";
  const params = new URLSearchParams();
  if (period.startMonth) params.set("startMonth", period.startMonth);
  if (period.endMonth) params.set("endMonth", period.endMonth);
  return `?${params.toString()}`;
}

export const reportsApi = {
  memoriaLabores: (period?: PeriodFilter) =>
    `/api/reports/memoria-labores${periodQuery(period)}`,
  horasSociales: (period?: PeriodFilter) =>
    `/api/reports/horas-sociales${periodQuery(period)}`,
  balanceFinanciero: (period?: PeriodFilter) =>
    `/api/reports/balance-financiero${periodQuery(period)}`,
  /** ODS siempre requiere un projectId (actividad). */
  odsProject: (id: string) => `/api/reports/ods-project/${id}`,
};

/* ============ Achievements / Logros ============ */

export type AchievementTier = "bronze" | "silver" | "gold" | "platinum";
export type AutoCriteriaType =
  | "none"
  | "hours_total"
  | "field_hours"
  | "admin_hours"
  | "activities_count"
  | "classes_count"
  | "social_records"
  | "first_activity"
  | "hours_milestone_50"
  | "hours_milestone_100";

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  tier: AchievementTier;
  points: number;
  auto: boolean;
  autoType: AutoCriteriaType;
  autoThreshold: number;
  active: boolean;
  repeatable: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { volunteers: number };
}

export interface AchievementDetail extends Achievement {
  volunteers?: VolunteerAchievement[];
}

export interface VolunteerAchievement {
  id: string;
  volunteerId: string;
  achievementId: string;
  automatic: boolean;
  grantedById: string | null;
  notes: string;
  createdAt: string;
  achievement: Achievement;
  volunteer?: Volunteer;
  grantedBy?: Volunteer | null;
}

export const ACHIEVEMENT_TIERS: {
  id: AchievementTier;
  label: string;
  emoji: string;
  ring: string;
  bg: string;
  text: string;
  gradient: string;
}[] = [
  {
    id: "bronze",
    label: "Bronce",
    emoji: "🥉",
    ring: "ring-amber-700/40 dark:ring-amber-600/40",
    bg: "bg-amber-100 dark:bg-amber-950/40",
    text: "text-amber-800 dark:text-amber-300",
    gradient: "from-amber-600 to-amber-800",
  },
  {
    id: "silver",
    label: "Plata",
    emoji: "🥈",
    ring: "ring-slate-400/40 dark:ring-slate-300/40",
    bg: "bg-slate-100 dark:bg-slate-800/40",
    text: "text-slate-700 dark:text-slate-200",
    gradient: "from-slate-400 to-slate-600",
  },
  {
    id: "gold",
    label: "Oro",
    emoji: "🥇",
    ring: "ring-yellow-500/40 dark:ring-yellow-400/40",
    bg: "bg-yellow-100 dark:bg-yellow-950/40",
    text: "text-yellow-800 dark:text-yellow-300",
    gradient: "from-yellow-500 to-amber-600",
  },
  {
    id: "platinum",
    label: "Platino",
    emoji: "💎",
    ring: "ring-cyan-500/40 dark:ring-cyan-400/40",
    bg: "bg-cyan-100 dark:bg-cyan-950/40",
    text: "text-cyan-800 dark:text-cyan-200",
    gradient: "from-cyan-500 to-violet-500",
  },
];

export function tierConfig(tier: AchievementTier | string | undefined) {
  return (
    ACHIEVEMENT_TIERS.find((t) => t.id === tier) || ACHIEVEMENT_TIERS[0]
  );
}

/** Catálogo de criterios automáticos con etiqueta legible para la UI. */
export const AUTO_CRITERIA: {
  id: AutoCriteriaType;
  label: string;
  description: string;
  needsThreshold: boolean;
}[] = [
  { id: "none", label: "Manual", description: "Lo otorga manualmente el presidente/líder.", needsThreshold: false },
  { id: "hours_total", label: "Horas totales", description: "Horas sociales aprobadas (total).", needsThreshold: true },
  { id: "field_hours", label: "Horas de campo", description: "Horas de campo aprobadas.", needsThreshold: true },
  { id: "admin_hours", label: "Horas administrativas", description: "Horas administrativas aprobadas.", needsThreshold: true },
  { id: "activities_count", label: "Actividades completadas", description: "Nº de actividades completadas en las que participó.", needsThreshold: true },
  { id: "classes_count", label: "Clases impartidas", description: "Nº de clases completadas en las que fue instructor.", needsThreshold: true },
  { id: "social_records", label: "Registros de horas", description: "Nº de registros de horas sociales aprobados.", needsThreshold: true },
  { id: "first_activity", label: "Primera actividad", description: "Al completar su primera actividad.", needsThreshold: false },
  { id: "hours_milestone_50", label: "Hito 50 horas", description: "Alcanza 50 horas sociales aprobadas.", needsThreshold: false },
  { id: "hours_milestone_100", label: "Hito 100 horas", description: "Alcanza 100 horas sociales aprobadas.", needsThreshold: false },
];

export function autoCriteriaLabel(id: AutoCriteriaType | string | undefined): string {
  return AUTO_CRITERIA.find((c) => c.id === id)?.label || "Manual";
}

export const achievementsApi = {
  list: (includeInactive = false) =>
    fetchApi<Achievement[]>(`/achievements${includeInactive ? "?includeInactive=1" : ""}`),
  get: (id: string) => fetchApi<AchievementDetail>(`/achievements/${id}`),
  create: (body: {
    name: string;
    description?: string;
    icon?: string;
    color?: string;
    tier?: AchievementTier;
    points?: number;
    auto?: boolean;
    autoType?: AutoCriteriaType;
    autoThreshold?: number;
    active?: boolean;
  }) => fetchApi<Achievement>("/achievements", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: Partial<{
    name: string;
    description: string;
    icon: string;
    color: string;
    tier: AchievementTier;
    points: number;
    auto: boolean;
    autoType: AutoCriteriaType;
    autoThreshold: number;
    active: boolean;
  }>) => fetchApi<Achievement>(`/achievements/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  remove: (id: string) => fetchApi<{ success: boolean }>(`/achievements/${id}`, { method: "DELETE" }),
  grant: (id: string, body: { volunteerId: string; notes?: string }) =>
    fetchApi<VolunteerAchievement>(`/achievements/${id}/grant`, { method: "POST", body: JSON.stringify(body) }),
  revoke: (id: string, body: { volunteerId: string }) =>
    fetchApi<{ success: boolean; existed: boolean }>(`/achievements/${id}/revoke`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  mine: () => fetchApi<VolunteerAchievement[]>("/achievements/mine"),
  byVolunteer: (volunteerId: string) =>
    fetchApi<VolunteerAchievement[]>(`/achievements/volunteer/${volunteerId}`),
  allGrants: () => fetchApi<VolunteerAchievement[]>("/achievements/grants"),
  evaluateMine: () =>
    fetchApi<{ granted: number; items: VolunteerAchievement[] }>(`/achievements/evaluate`, {
      method: "POST",
    }),
  leaderboard: (limit = 20) =>
    fetchApi<{ top: { volunteerId: string; points: number; count: number; volunteer: Volunteer }[] }>(
      `/achievements/leaderboard?limit=${limit}`,
    ),
};

/* ============ Helpers ============ */

export const COMMITTEE_COLORS: Record<string, {
  bg: string;
  text: string;
  border: string;
  ring: string;
  dot: string;
  gradient: string;
}> = {
  emerald: {
    bg: "bg-primary/15 dark:bg-primary/20",
    text: "text-primary",
    border: "border-primary/30 dark:border-primary/40",
    ring: "ring-primary/30",
    dot: "bg-primary",
    gradient: "from-primary to-secondary",
  },
  graphite: {
    bg: "bg-graphite-100 dark:bg-graphite-950/40",
    text: "text-graphite-700 dark:text-graphite-300",
    border: "border-graphite-300 dark:border-graphite-800",
    ring: "ring-graphite-500/30",
    dot: "bg-graphite-500",
    gradient: "from-graphite-500 to-orange-500",
  },
  rose: {
    bg: "bg-rose-100 dark:bg-rose-950/40",
    text: "text-rose-700 dark:text-rose-300",
    border: "border-rose-300 dark:border-rose-800",
    ring: "ring-rose-500/30",
    dot: "bg-rose-500",
    gradient: "from-rose-500 to-pink-500",
  },
  sky: {
    bg: "bg-sky-100 dark:bg-sky-950/40",
    text: "text-sky-700 dark:text-sky-300",
    border: "border-sky-300 dark:border-sky-800",
    ring: "ring-sky-500/30",
    dot: "bg-sky-500",
    gradient: "from-sky-500 to-cyan-500",
  },
  violet: {
    bg: "bg-violet-100 dark:bg-violet-950/40",
    text: "text-violet-700 dark:text-violet-300",
    border: "border-violet-300 dark:border-violet-800",
    ring: "ring-violet-500/30",
    dot: "bg-violet-500",
    gradient: "from-violet-500 to-purple-500",
  },
};

export function committeeColorClass(color?: string) {
  return COMMITTEE_COLORS[color || "emerald"] || COMMITTEE_COLORS.emerald;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-SV", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount || 0);
}

export function formatDate(date?: string): string {
  if (!date) return "—";
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return date;
    return new Intl.DateTimeFormat("es-SV", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(d);
  } catch {
    return date;
  }
}

/** CSV builder + download helper (client-side). */
export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escape = (v: string | number) => {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const csv = [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ---------- Notificaciones ---------- */

export type NotificationType =
  | "social_hour"
  | "activity"
  | "income"
  | "expense"
  | "volunteer"
  | "system"
  | "hour_request"
  | "class";

export interface NotificationItem {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string;
  read: boolean;
  emailed: boolean;
  metadata: string;
  createdAt: string;
}

export interface NotificationsListResponse {
  items: NotificationItem[];
  unreadCount: number;
  total: number;
}

export const notificationsApi = {
  list: (unreadOnly = false) =>
    fetchApi<NotificationsListResponse>(
      `/notifications${unreadOnly ? "?unread=1" : ""}`,
    ),
  markRead: (id: string) =>
    fetchApi<{ success: boolean; notification: NotificationItem }>(
      `/notifications/${id}/read`,
      { method: "POST" },
    ),
  markAllRead: () =>
    fetchApi<{ success: boolean; marked: number }>(`/notifications/read-all`, {
      method: "POST",
    }),
};

/* ---------- Email ---------- */
// (Eliminado: las notificaciones son exclusivamente in-app. Si en el futuro se
// requiere integración con un proveedor de email, restaurar este bloque.)
