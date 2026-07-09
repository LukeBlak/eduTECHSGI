"use client";

import {
  LayoutDashboard,
  Users,
  Network,
  CalendarDays,
  Clock,
  GraduationCap,
  FileSpreadsheet,
  Wallet,
  Receipt,
  UserCircle,
  CalendarRange,
  Trophy,
  BellRing,
  ClipboardList,
  Award,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/api";

export type SectionId =
  | "dashboard"
  | "voluntarios"
  | "comites"
  | "actividades"
  | "horas"
  | "solicitudes-horas"
  | "clases"
  | "calendario"
  | "ranking"
  | "logros"
  | "reportes"
  | "ingresos"
  | "egresos"
  | "notificaciones"
  | "perfil";

export type NavGroup = "principal" | "gestion" | "finanzas" | "sistema" | "personal";

export interface NavItem {
  id: SectionId;
  label: string;
  icon: LucideIcon;
  description: string;
  group: NavGroup;
  /**
   * Si true, solo visible para roles privilegiados (presidente, vicepresidente,
   * líder de comité, admin). Los voluntarios no lo ven.
   */
  privilegedOnly?: boolean;
  /**
   * Si true, solo visible para roles que pueden aprobar horas
   * (presidente, vicepresidente, líder de comité, admin).
   */
  approverOnly?: boolean;
  /** (legacy) alias de privilegedOnly. */
  adminOnly?: boolean;
}

export const NAV_GROUPS: { id: NavGroup; label: string }[] = [
  { id: "principal", label: "Principal" },
  { id: "gestion", label: "Gestión" },
  { id: "finanzas", label: "Finanzas" },
  { id: "sistema", label: "Sistema" },
  { id: "personal", label: "Personal" },
];

export const NAV_ITEMS: NavItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    description: "Resumen general de la asociación",
    group: "principal",
  },
  {
    id: "voluntarios",
    label: "Voluntarios",
    icon: Users,
    description: "Gestión de voluntarios registrados",
    group: "gestion",
    privilegedOnly: true,
  },
  {
    id: "comites",
    label: "Comités",
    icon: Network,
    description: "Comités de la asociación",
    group: "gestion",
  },
  {
    id: "actividades",
    label: "Actividades",
    icon: CalendarDays,
    description: "Actividades, eventos y proyectos",
    group: "gestion",
  },
  {
    id: "horas",
    label: "Horas Sociales",
    icon: Clock,
    description: "Registro y aprobación de horas sociales",
    group: "gestion",
  },
  {
    id: "solicitudes-horas",
    label: "Solicitudes de Horas",
    icon: ClipboardList,
    description: "Pide más horas o revisa solicitudes pendientes",
    group: "gestion",
  },
  {
    id: "clases",
    label: "Clases",
    icon: GraduationCap,
    description: "Clases impartidas por voluntarios",
    group: "gestion",
  },
  {
    id: "calendario",
    label: "Calendario",
    icon: CalendarRange,
    description: "Vista mensual de actividades y clases",
    group: "gestion",
  },
  {
    id: "ranking",
    label: "Ranking",
    icon: Trophy,
    description: "Voluntarios destacados y logros",
    group: "gestion",
  },
  {
    id: "logros",
    label: "Logros",
    icon: Award,
    description: "Gestiona y visualiza logros de voluntarios",
    group: "gestion",
  },
  {
    id: "ingresos",
    label: "Ingresos",
    icon: Wallet,
    description: "Registro de ingresos de la asociación",
    group: "finanzas",
    privilegedOnly: true,
  },
  {
    id: "egresos",
    label: "Egresos",
    icon: Receipt,
    description: "Gastos y egresos de la asociación",
    group: "finanzas",
    privilegedOnly: true,
  },
  {
    id: "reportes",
    label: "Reportes",
    icon: FileSpreadsheet,
    description: "Descarga de reportes Excel y Word",
    group: "finanzas",
    privilegedOnly: true,
  },
  {
    id: "notificaciones",
    label: "Notificaciones",
    icon: BellRing,
    description: "Configuración de notificaciones y email",
    group: "sistema",
    privilegedOnly: true,
  },
  {
    id: "perfil",
    label: "Mi Perfil",
    icon: UserCircle,
    description: "Mis horas sociales y constancia",
    group: "personal",
  },
];

/** ¿Es este rol privilegiado (acceso a finanzas + admin)? */
export function isPrivilegedRole(role: Role | undefined | null): boolean {
  if (!role) return false;
  return ["admin", "committee_leader", "president", "vice_president"].includes(role);
}

/** ¿Puede este rol aprobar horas? */
export function canApproveHoursRole(role: Role | undefined | null): boolean {
  return isPrivilegedRole(role);
}

/** Filtra los items de nav visibles para un rol. */
export function visibleNavItems(role: Role | undefined | null): NavItem[] {
  const privileged = isPrivilegedRole(role);
  return NAV_ITEMS.filter((item) => {
    const restricted = item.privilegedOnly || item.adminOnly || item.approverOnly;
    if (!restricted) return true;
    return privileged;
  });
}

export function navItem(id: SectionId): NavItem {
  return NAV_ITEMS.find((n) => n.id === id) || NAV_ITEMS[0];
}
