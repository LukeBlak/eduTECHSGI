"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Users,
  CalendarDays,
  Network,
  GraduationCap,
  Wallet,
  Receipt,
  Clock,
  Search,
  CalendarRange,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import {
  volunteersApi,
  activitiesApi,
  committeesApi,
  classesApi,
  incomeApi,
  expenseApi,
  socialHoursApi,
  formatCurrency,
  isPrivileged,
  type Role,
  type Volunteer,
  type Activity,
  type Committee,
  type ClassItem,
  type Income,
  type Expense,
  type SocialHour,
} from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { visibleNavItems, type SectionId } from "./nav";

interface GlobalSearchProps {
  onNavigate: (section: SectionId) => void;
  /** Extra trigger to open from a button in the Topbar */
  openSignal?: number;
}

interface SearchEntry {
  id: string;
  label: string;
  sublabel: string;
  icon: LucideIcon;
  section: SectionId;
  badge?: string;
}

/** Etiquetas cortas para badges compactos en resultados de búsqueda. */
const ROLE_SHORT_BADGE: Partial<Record<Role, string>> = {
  admin: "Admin",
  committee_leader: "Líder",
  president: "Presidente",
  vice_president: "Vice",
};

export function GlobalSearch({ onNavigate, openSignal }: GlobalSearchProps) {
  const { user } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [socialHours, setSocialHours] = useState<SocialHour[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Cmd/Ctrl+K shortcut
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Open from external signal (Topbar button)
  useEffect(() => {
    if (openSignal && openSignal > 0) setOpen(true);
  }, [openSignal]);

  // Lazy load data on first open
  useEffect(() => {
    if (open && !loaded) {
      setLoaded(true);
      Promise.all([
        volunteersApi.list().catch(() => []),
        activitiesApi.list().catch(() => []),
        committeesApi.list().catch(() => []),
        classesApi.list().catch(() => []),
        incomeApi.list().catch(() => []),
        expenseApi.list().catch(() => []),
        socialHoursApi.list().catch(() => []),
      ]).then(([v, a, c, cl, inc, exp, sh]) => {
        setVolunteers(v as Volunteer[]);
        setActivities(a as Activity[]);
        setCommittees(c as Committee[]);
        setClasses(cl as ClassItem[]);
        setIncomes(inc as Income[]);
        setExpenses(exp as Expense[]);
        setSocialHours(sh as SocialHour[]);
      });
    }
  }, [open, loaded]);

  const handleSelect = useCallback(
    (section: SectionId) => {
      setOpen(false);
      onNavigate(section);
    },
    [onNavigate],
  );

  // Items de navegación visibles para el rol actual (los voluntarios no ven
  // finanzas / sistema / gestión de voluntarios). Filtra también ingresos y
  // egresos de los resultados de búsqueda para mantener consistencia con el
  // Sidebar.
  const navEntries: SearchEntry[] = useMemo(() => {
    const visible = visibleNavItems(user?.role);
    // Asegura íconos significativos en la búsqueda (los NavItem ya tienen su
    // propio icon, pero mantenemos un fallback a Search por seguridad).
    return visible.map((item) => ({
      id: `nav-${item.id}`,
      label: item.label,
      sublabel: item.description,
      icon: (item.icon as LucideIcon) ?? Search,
      section: item.id,
    }));
  }, [user?.role]);

  // ¿El usuario actual puede ver ingresos/egresos? Si no, ocultamos esos
  // grupos de resultados para no exponer datos financieros en la búsqueda.
  const canSeeFinances = isPrivileged(user?.role);

  const volunteerEntries: SearchEntry[] = volunteers.slice(0, 20).map((v) => ({
    id: `vol-${v.id}`,
    label: v.name,
    sublabel: `Carnet ${v.studentId}${v.career ? ` · ${v.career}` : ""}`,
    icon: Users,
    section: "voluntarios",
    badge: ROLE_SHORT_BADGE[v.role],
  }));

  const activityEntries: SearchEntry[] = activities.slice(0, 20).map((a) => ({
    id: `act-${a.id}`,
    label: a.title,
    sublabel: a.committee?.name || "Sin comité",
    icon: CalendarDays,
    section: "actividades",
    badge: `${a.hours}h`,
  }));

  const committeeEntries: SearchEntry[] = committees.map((c) => ({
    id: `com-${c.id}`,
    label: c.name,
    sublabel: c.description || "Comité",
    icon: Network,
    section: "comites",
  }));

  const classEntries: SearchEntry[] = classes.slice(0, 20).map((c) => ({
    id: `cls-${c.id}`,
    label: c.title,
    sublabel: c.school || "Clase",
    icon: GraduationCap,
    section: "clases",
    badge: `${c.durationHours}h`,
  }));

  const incomeEntries: SearchEntry[] = incomes.slice(0, 10).map((i) => ({
    id: `inc-${i.id}`,
    label: i.concept,
    sublabel: formatCurrency(i.amount),
    icon: Wallet,
    section: "ingresos",
  }));

  const expenseEntries: SearchEntry[] = expenses.slice(0, 10).map((e) => ({
    id: `exp-${e.id}`,
    label: e.concept,
    sublabel: formatCurrency(e.amount),
    icon: Receipt,
    section: "egresos",
  }));

  const hourEntries: SearchEntry[] = socialHours.slice(0, 10).map((h) => ({
    id: `sh-${h.id}`,
    label: h.volunteer?.name || "Voluntario",
    sublabel: `${h.hours}h · ${h.type === "admin" ? "Administrativa" : "De campo"}`,
    icon: Clock,
    section: "horas",
  }));

  function renderGroup(title: string, entries: SearchEntry[]) {
    if (entries.length === 0) return null;
    return (
      <CommandGroup heading={title}>
        {entries.map((e) => (
          <CommandItem
            key={e.id}
            value={`${e.label} ${e.sublabel}`}
            onSelect={() => handleSelect(e.section)}
            className="cursor-pointer"
          >
            <e.icon className="size-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-sm font-medium truncate block">{e.label}</span>
                <span className="text-xs text-muted-foreground truncate block">{e.sublabel}</span>
              </div>
              {e.badge && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/15 text-primary shrink-0">
                  {e.badge}
                </span>
              )}
            </div>
          </CommandItem>
        ))}
      </CommandGroup>
    );
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Buscar voluntarios, actividades, comités, ingresos…" />
      <CommandList>
        <CommandEmpty>No se encontraron resultados.</CommandEmpty>
        {renderGroup("Navegación", navEntries)}
        <CommandSeparator />
        {renderGroup("Voluntarios", volunteerEntries)}
        {renderGroup("Actividades", activityEntries)}
        {renderGroup("Comités", committeeEntries)}
        {renderGroup("Clases", classEntries)}
        {canSeeFinances && (
          <>
            <CommandSeparator />
            {renderGroup("Ingresos recientes", incomeEntries)}
            {renderGroup("Egresos recientes", expenseEntries)}
          </>
        )}
        {renderGroup("Horas sociales recientes", hourEntries)}
      </CommandList>
    </CommandDialog>
  );
}
