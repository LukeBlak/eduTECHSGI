"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  GraduationCap,
  MapPin,
  Users,
  Clock,
  Filter,
  X,
  Sparkles,
  ListTree,
  Calendar,
} from "lucide-react";
import {
  activitiesApi,
  classesApi,
  committeesApi,
  formatDate,
  type Activity,
  type ClassItem,
  type Committee,
} from "@/lib/api";
import { SectionHeader, EmptyState } from "../Shared";
import { CalendarEventDetailDialog, type CalEvent } from "./CalendarEventDetailDialog";
import { cn } from "@/lib/utils";

type CalendarEvent = {
  id: string;
  kind: "activity" | "class";
  title: string;
  date: string; // ISO date string
  location?: string;
  hours: number;
  participants: number;
  committee?: Committee | null;
  meta?: string; // topic for class, type for activity
};

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function parseDateSafe(s?: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d;
}

export function CalendarioSection() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [filterKind, setFilterKind] = useState<"all" | "activity" | "class">("all");
  const [filterCommittee, setFilterCommittee] = useState<string>("all");
  const [view, setView] = useState<"month" | "timeline">("month");
  const [detailEvent, setDetailEvent] = useState<CalEvent | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      activitiesApi.list(),
      classesApi.list(),
      committeesApi.list(),
    ])
      .then(([a, c, com]) => {
        if (cancelled) return;
        setActivities(a);
        setClasses(c);
        setCommittees(com);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error al cargar");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Combine activities + classes into calendar events
  const events: CalendarEvent[] = useMemo(() => {
    const list: CalendarEvent[] = [];
    for (const a of activities) {
      const d = parseDateSafe(a.startDate);
      if (!d) continue;
      list.push({
        id: a.id,
        kind: "activity",
        title: a.title,
        date: d.toISOString(),
        location: a.location,
        hours: a.hours,
        participants: a._count?.volunteers ?? a.volunteers?.length ?? 0,
        committee: a.committee,
        meta: a.type,
      });
    }
    for (const c of classes) {
      const d = parseDateSafe(c.date);
      if (!d) continue;
      list.push({
        id: c.id,
        kind: "class",
        title: c.title,
        date: d.toISOString(),
        location: c.school,
        hours: c.durationHours,
        participants: c.instructors?.length ?? 0,
        committee: c.committee,
        meta: c.topic,
      });
    }
    return list;
  }, [activities, classes]);

  // Apply filters
  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (filterKind !== "all" && e.kind !== filterKind) return false;
      if (filterCommittee !== "all" && e.committee?.id !== filterCommittee) return false;
      return true;
    });
  }, [events, filterKind, filterCommittee]);

  // Build calendar grid: Monday-first
  const gridDays = useMemo(() => {
    const first = startOfMonth(cursor);
    const last = endOfMonth(cursor);
    const startWeekday = (first.getDay() + 6) % 7; // 0 = Monday
    const totalDays = last.getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let day = 1; day <= totalDays; day++) {
      cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), day));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor]);

  // Map date → events
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of filteredEvents) {
      const d = new Date(e.date);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [filteredEvents]);

  const monthLabel = `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
  const today = new Date();
  const hasActiveFilters = filterKind !== "all" || filterCommittee !== "all";

  function clearFilters() {
    setFilterKind("all");
    setFilterCommittee("all");
  }

  function goToToday() {
    setCursor(startOfMonth(new Date()));
    setSelectedDay(new Date());
  }

  if (loading) return <CalendarioSkeleton />;
  if (error) {
    return (
      <EmptyState
        icon={CalendarRange}
        title="No se pudo cargar el calendario"
        description={error}
      />
    );
  }

  const selectedKey = selectedDay
    ? `${selectedDay.getFullYear()}-${selectedDay.getMonth()}-${selectedDay.getDate()}`
    : null;
  const selectedEvents = selectedKey ? eventsByDay.get(selectedKey) ?? [] : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-5"
    >
      <SectionHeader
        title="Calendario"
        description={view === "month" ? "Vista mensual de actividades y clases programadas" : "Cronología completa de actividades y clases"}
        action={
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border bg-muted/40 p-0.5" role="group" aria-label="Vista del calendario">
              <button
                type="button"
                onClick={() => setView("month")}
                aria-pressed={view === "month"}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-medium transition-all",
                  view === "month"
                    ? "bg-background shadow-sm text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Calendar className="size-3.5" />
                Mes
              </button>
              <button
                type="button"
                onClick={() => setView("timeline")}
                aria-pressed={view === "timeline"}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-medium transition-all",
                  view === "timeline"
                    ? "bg-background shadow-sm text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <ListTree className="size-3.5" />
                Línea de tiempo
              </button>
            </div>
            {view === "month" && (
              <Button variant="outline" size="sm" onClick={goToToday}>
                <CalendarDays className="size-4" />
                Hoy
              </Button>
            )}
          </div>
        }
      />

      {/* Filters card */}
      <Card className="ring-1 ring-primary/10">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Filter className="size-4" />
              <span className="font-medium">Filtros</span>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-2">
                  <span className={cn(filterKind !== "all" && "text-primary font-medium")}>
                    Tipo: {filterKind === "all" ? "Todos" : filterKind === "activity" ? "Actividades" : "Clases"}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => setFilterKind("all")}>Todos</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterKind("activity")}>Actividades</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterKind("class")}>Clases</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-2">
                  <span className={cn(filterCommittee !== "all" && "text-primary font-medium")}>
                    Comité: {filterCommittee === "all"
                      ? "Todos"
                      : committees.find((c) => c.id === filterCommittee)?.name ?? "—"}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
                <DropdownMenuItem onClick={() => setFilterCommittee("all")}>Todos los comités</DropdownMenuItem>
                {committees.map((c) => (
                  <DropdownMenuItem key={c.id} onClick={() => setFilterCommittee(c.id)}>
                    {c.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={clearFilters}>
                <X className="size-3.5" />
                Limpiar
              </Button>
            )}

            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              {filteredEvents.length} evento(s) · {monthLabel}
            </span>
          </div>
        </CardContent>
      </Card>

      {view === "timeline" ? (
        <TimelineView
          events={filteredEvents}
          today={today}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={clearFilters}
          onOpenEvent={setDetailEvent}
        />
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Calendar grid */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarRange className="size-4 text-primary" />
                {monthLabel}
              </CardTitle>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
                  aria-label="Mes anterior"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
                  aria-label="Mes siguiente"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Weekday header */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {WEEKDAYS.map((d) => (
                <div
                  key={d}
                  className="text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground py-1"
                >
                  {d}
                </div>
              ))}
            </div>
            {/* Days grid */}
            <div className="grid grid-cols-7 gap-1">
              {gridDays.map((day, i) => {
                if (!day) return <div key={i} className="aspect-square min-h-[68px] rounded-md bg-muted/30" />;
                const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
                const dayEvents = eventsByDay.get(key) ?? [];
                const isToday = isSameDay(day, today);
                const isSelected = selectedDay && isSameDay(day, selectedDay);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedDay(day)}
                    className={cn(
                      "aspect-square min-h-[68px] rounded-md border p-1.5 text-left flex flex-col gap-1 transition-all",
                      "hover:border-primary/50 hover:shadow-sm",
                      isSelected
                        ? "border-primary bg-accent ring-1 ring-primary/30"
                        : "border-border bg-background",
                    )}
                  >
                    <span
                      className={cn(
                        "text-xs font-semibold tabular-nums size-5 rounded-full flex items-center justify-center",
                        isToday
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {day.getDate()}
                    </span>
                    <div className="flex-1 space-y-0.5 overflow-hidden">
                      {dayEvents.slice(0, 3).map((e) => (
                        <button
                          key={`${e.kind}-${e.id}`}
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setDetailEvent(e);
                          }}
                          className={cn(
                            "w-full text-left text-[10px] font-medium truncate px-1 py-0.5 rounded leading-tight transition-all hover:scale-[1.02] hover:shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary cursor-pointer",
                            e.kind === "activity"
                              ? "bg-sky-100 text-sky-700 hover:bg-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:hover:bg-sky-900/60"
                              : "bg-violet-100 text-violet-700 hover:bg-violet-200 dark:bg-violet-950/50 dark:text-violet-300 dark:hover:bg-violet-900/60",
                          )}
                          title={`${e.title} — Clic para ver detalles`}
                          aria-label={`Ver detalles de ${e.title}`}
                        >
                          {e.title}
                        </button>
                      ))}
                      {dayEvents.length > 3 && (
                        <div className="text-[10px] text-muted-foreground px-1 tabular-nums">
                          +{dayEvents.length - 3} más
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded bg-sky-500" />
                Actividades
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded bg-violet-500" />
                Clases
              </span>
              <span className="flex items-center gap-1.5 ml-auto">
                <span className="size-2.5 rounded-full bg-primary" />
                Hoy
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Sidebar: selected day events */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="size-4 text-primary" />
              {selectedDay ? (
                <>
                  {selectedDay.toLocaleDateString("es-SV", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                </>
              ) : (
                "Selecciona un día"
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedDay === null ? (
              <div className="text-center py-8">
                <Sparkles className="size-8 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Haz clic en un día del calendario para ver sus eventos.
                </p>
              </div>
            ) : selectedEvents.length === 0 ? (
              <div className="text-center py-8">
                <CalendarDays className="size-8 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Sin eventos programados para este día.
                </p>
              </div>
            ) : (
              selectedEvents.map((e) => (
                <button
                  key={`${e.kind}-${e.id}`}
                  type="button"
                  onClick={() => setDetailEvent(e)}
                  className={cn(
                    "w-full text-left rounded-lg border p-3 transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer",
                    e.kind === "activity"
                      ? "border-sky-200 dark:border-sky-900 bg-sky-50/50 dark:bg-sky-950/20 hover:border-sky-300 dark:hover:border-sky-700"
                      : "border-violet-200 dark:border-violet-900 bg-violet-50/50 dark:bg-violet-950/20 hover:border-violet-300 dark:hover:border-violet-700",
                  )}
                  aria-label={`Ver detalles de ${e.title}`}
                >
                  <div className="flex items-start gap-2">
                    <div
                      className={cn(
                        "size-8 rounded-md flex items-center justify-center shrink-0",
                        e.kind === "activity"
                          ? "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
                          : "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
                      )}
                    >
                      {e.kind === "activity"
                        ? <CalendarDays className="size-4" />
                        : <GraduationCap className="size-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-1">
                        <p className="text-sm font-semibold leading-tight">
                          {e.title}
                        </p>
                        <span className="text-[10px] text-primary font-medium shrink-0 mt-0.5 inline-flex items-center gap-0.5">
                          Ver
                          <ChevronRight className="size-2.5" />
                        </span>
                      </div>
                      {e.meta && (
                        <p className="text-xs text-muted-foreground mt-0.5">{e.meta}</p>
                      )}
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="size-3" />
                          <span className="tabular-nums">{e.hours}h</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="size-3" />
                          <span className="tabular-nums">{e.participants}</span>
                        </span>
                        {e.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="size-3" />
                            <span className="truncate max-w-[120px]">{e.location}</span>
                          </span>
                        )}
                      </div>
                      {e.committee && (
                        <Badge variant="secondary" className="mt-2 text-[10px] h-5">
                          {e.committee.name}
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </div>
      )}

      {/* Upcoming events list — only in month view (timeline already shows chronological) */}
      {view === "month" && (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            Próximos eventos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(() => {
            const upcoming = filteredEvents
              .filter((e) => new Date(e.date) >= new Date(today.getFullYear(), today.getMonth(), today.getDate()))
              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
              .slice(0, 6);
            if (upcoming.length === 0) {
              return (
                <EmptyState
                  icon={CalendarRange}
                  title="Sin eventos próximos"
                  description={hasActiveFilters ? "Prueba a limpiar los filtros." : undefined}
                />
              );
            }
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {upcoming.map((e) => (
                  <button
                    key={`${e.kind}-${e.id}`}
                    type="button"
                    onClick={() => setDetailEvent(e)}
                    className="w-full text-left rounded-lg border p-3 transition-all hover:shadow-md hover:-translate-y-0.5 hover:border-primary/40 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                    aria-label={`Ver detalles de ${e.title}`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-[10px] h-5",
                          e.kind === "activity"
                            ? "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
                            : "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
                        )}
                      >
                        {e.kind === "activity" ? "Actividad" : "Clase"}
                      </Badge>
                      <span className="text-xs text-muted-foreground ml-auto tabular-nums">
                        {formatDate(e.date)}
                      </span>
                    </div>
                    <p className="text-sm font-semibold leading-tight mb-1">{e.title}</p>
                    {e.location && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="size-3" />
                        {e.location}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1 tabular-nums">
                        <Clock className="size-3" />
                        {e.hours}h
                      </span>
                      <span className="flex items-center gap-1 tabular-nums">
                        <Users className="size-3" />
                        {e.participants}
                      </span>
                    </div>
                    <p className="mt-2 text-[10px] text-primary font-medium inline-flex items-center gap-0.5">
                      Ver detalles
                      <ChevronRight className="size-2.5" />
                    </p>
                  </button>
                ))}
              </div>
            );
          })()}
        </CardContent>
      </Card>
      )}

      {/* Dialog: detalle del evento clickeado (actividad o clase) */}
      <CalendarEventDetailDialog
        event={detailEvent}
        open={!!detailEvent}
        onOpenChange={(o) => !o && setDetailEvent(null)}
      />
    </motion.div>
  );
}

function CalendarioSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-20" />
      </div>
      <Skeleton className="h-16 w-full" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Skeleton className="lg:col-span-2 h-[480px]" />
        <Skeleton className="h-[480px]" />
      </div>
    </div>
  );
}

/**
 * TimelineView — vertical chronological list of calendar events grouped by
 * month. Shows past + upcoming events with a "today" marker. Each entry is a
 * card with icon, title, date, committee, hours/participants, location.
 *
 * Used as an alternative to the monthly grid when the user wants to scan a
 * long chronological range without paging month-by-month.
 */
function TimelineView({
  events,
  today,
  hasActiveFilters,
  onClearFilters,
  onOpenEvent,
}: {
  events: CalendarEvent[];
  today: Date;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  onOpenEvent: (e: CalendarEvent) => void;
}) {
  // Sort all events ascending by date
  const sorted = useMemo(
    () =>
      [...events].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      ),
    [events],
  );

  // Group by month key (YYYY-MM)
  const groups = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of sorted) {
      const d = new Date(e.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries());
  }, [sorted]);

  // Stats
  const pastCount = sorted.filter((e) => new Date(e.date) < today).length;
  const upcomingCount = sorted.length - pastCount;

  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  return (
    <div className="space-y-5">
      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border bg-muted/30 px-4 py-2.5 text-center">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</p>
          <p className="text-lg font-bold tabular-nums">{sorted.length}</p>
        </div>
        <div className="rounded-lg border bg-muted/30 px-4 py-2.5 text-center">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Pasados</p>
          <p className="text-lg font-bold tabular-nums text-muted-foreground">{pastCount}</p>
        </div>
        <div className="rounded-lg border bg-accent/60 border-primary/20 px-4 py-2.5 text-center">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Próximos</p>
          <p className="text-lg font-bold tabular-nums text-primary">{upcomingCount}</p>
        </div>
      </div>

      {sorted.length === 0 ? (
        <Card>
          <CardContent className="py-0">
            <EmptyState
              icon={CalendarRange}
              title="Sin eventos en la línea de tiempo"
              description={hasActiveFilters ? "Prueba a limpiar los filtros para ver más eventos." : "Agrega actividades o clases para verlas aquí."}
              action={hasActiveFilters ? (
                <Button variant="outline" size="sm" onClick={onClearFilters}>
                  <X className="size-3.5" /> Limpiar filtros
                </Button>
              ) : undefined}
            />
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="relative pl-6 sm:pl-10 pr-4 sm:pr-6 py-5">
              {/* Vertical line */}
              <div
                className="absolute top-5 bottom-5 left-3 sm:left-7 w-0.5 bg-gradient-to-b from-primary/40 via-border to-primary/40"
                aria-hidden
              />
              {groups.map(([monthKey, items]) => {
                const [yearStr, monthStr] = monthKey.split("-");
                const year = Number(yearStr);
                const month = Number(monthStr) - 1;
                const monthLabel = `${MONTHS[month]} ${year}`;
                const isCurrentMonth = monthKey === todayKey;
                return (
                  <div key={monthKey} className="relative">
                    {/* Month header on the timeline */}
                    <div className="flex items-center gap-3 mb-3 -ml-6 sm:-ml-10 pl-6 sm:pl-10">
                      <span
                        className={cn(
                          "absolute left-0 sm:left-4 size-3 rounded-full border-2 border-background",
                          isCurrentMonth
                            ? "bg-primary ring-2 ring-primary/30"
                            : "bg-muted-foreground/40",
                        )}
                        aria-hidden
                      />
                      <h3 className="text-sm font-semibold tracking-wide flex items-center gap-2">
                        {monthLabel}
                        <Badge
                          variant="secondary"
                          className="text-[10px] h-5 tabular-nums bg-muted/60"
                        >
                          {items.length} evento{items.length === 1 ? "" : "s"}
                        </Badge>
                        {isCurrentMonth && (
                          <Badge className="text-[10px] h-5 bg-primary/15 text-primary">
                            Mes actual
                          </Badge>
                        )}
                      </h3>
                    </div>

                    {/* Events in this month */}
                    <ul className="space-y-2.5 mb-6">
                      {items.map((e, idx) => {
                        const d = new Date(e.date);
                        const isPast = d < today;
                        const isToday =
                          d.getFullYear() === today.getFullYear() &&
                          d.getMonth() === today.getMonth() &&
                          d.getDate() === today.getDate();
                        return (
                          <motion.li
                            key={`${e.kind}-${e.id}-${idx}`}
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: Math.min(idx * 0.04, 0.4), duration: 0.25 }}
                            className="relative -ml-6 sm:-ml-10 pl-6 sm:pl-10"
                          >
                            {/* Node on the line */}
                            <span
                              className={cn(
                                "absolute left-0 sm:left-4 top-3 size-2.5 rounded-full ring-2 ring-background",
                                e.kind === "activity"
                                  ? "bg-sky-500"
                                  : "bg-violet-500",
                                isToday && "ring-primary animate-soft-pulse",
                              )}
                              aria-hidden
                            />
                            <button
                              type="button"
                              onClick={() => onOpenEvent(e)}
                              className={cn(
                                "w-full text-left rounded-lg border p-3 transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
                                e.kind === "activity"
                                  ? "border-sky-200/70 dark:border-sky-900/60 bg-sky-50/30 dark:bg-sky-950/10 hover:border-sky-300"
                                  : "border-violet-200/70 dark:border-violet-900/60 bg-violet-50/30 dark:bg-violet-950/10 hover:border-violet-300",
                                isPast && "opacity-70",
                              )}
                              aria-label={`Ver detalles de ${e.title}`}
                            >
                              <div className="flex items-start gap-3">
                                <div
                                  className={cn(
                                    "size-9 rounded-md flex items-center justify-center shrink-0",
                                    e.kind === "activity"
                                      ? "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
                                      : "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
                                  )}
                                >
                                  {e.kind === "activity"
                                    ? <CalendarDays className="size-4" />
                                    : <GraduationCap className="size-4" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="text-sm font-semibold leading-tight">
                                      {e.title}
                                    </p>
                                    <span
                                      className={cn(
                                        "text-xs tabular-nums shrink-0",
                                        isToday
                                          ? "text-primary font-semibold"
                                          : "text-muted-foreground",
                                      )}
                                      title={isToday ? "Hoy" : undefined}
                                    >
                                      {d.toLocaleDateString("es-SV", { day: "2-digit", month: "short" })}
                                      {isToday && " · Hoy"}
                                    </span>
                                  </div>
                                  {e.meta && (
                                    <p className="text-xs text-muted-foreground mt-0.5">{e.meta}</p>
                                  )}
                                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                      <Clock className="size-3" />
                                      <span className="tabular-nums">{e.hours}h</span>
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Users className="size-3" />
                                      <span className="tabular-nums">{e.participants}</span>
                                    </span>
                                    {e.location && (
                                      <span className="flex items-center gap-1">
                                        <MapPin className="size-3" />
                                        <span className="truncate max-w-[160px]">{e.location}</span>
                                      </span>
                                    )}
                                  </div>
                                  {e.committee && (
                                    <Badge variant="secondary" className="mt-1.5 text-[10px] h-5">
                                      {e.committee.name}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </button>
                          </motion.li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
