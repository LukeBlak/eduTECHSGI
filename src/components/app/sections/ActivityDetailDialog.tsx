"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  CalendarDays,
  MapPin,
  Clock,
  Users,
  CheckCircle2,
  Wallet,
  TrendingDown,
  Briefcase,
  MapPinned,
  Loader2,
  Target,
  UserPlus,
  Save,
  X,
  Pencil,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  activitiesApi,
  expenseApi,
  volunteersApi,
  committeeColorClass,
  formatCurrency,
  formatDate,
  isPrivileged,
  type Activity,
  type ActivityDetail,
  type Expense,
  type Volunteer,
} from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { cn } from "@/lib/utils";

interface ActivityDetailDialogProps {
  activity: Activity | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVolunteersChanged?: () => void;
}

export function ActivityDetailDialog({
  activity,
  open,
  onOpenChange,
  onVolunteersChanged,
}: ActivityDetailDialogProps) {
  const { user } = useAuthStore();
  // Pueden gestionar voluntarios inscritos y ver gastos de la actividad:
  // admin, presidente, vicepresidente y líder de comité.
  const isAdmin = isPrivileged(user?.role);
  const [detail, setDetail] = useState<ActivityDetail | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [manageMode, setManageMode] = useState(false);
  const [allVolunteers, setAllVolunteers] = useState<Volunteer[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !activity) {
      setDetail(null);
      setExpenses([]);
      setManageMode(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      activitiesApi.get(activity.id),
      expenseApi.list(),
      isAdmin ? volunteersApi.list() : Promise.resolve([] as Volunteer[]),
    ])
      .then(([d, exps, vols]) => {
        if (cancelled) return;
        setDetail(d);
        setExpenses(exps.filter((e) => e.activityId === activity.id));
        setAllVolunteers(vols);
        setSelectedIds(new Set((d.volunteers ?? []).map((v) => v.id)));
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        toast.error(
          e instanceof Error ? e.message : "Error al cargar detalle",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, activity, isAdmin]);

  function toggleVolunteer(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function saveVolunteers() {
    if (!activity) return;
    setSaving(true);
    try {
      const updated = await activitiesApi.update(activity.id, {
        volunteerIds: Array.from(selectedIds),
      });
      // Refresh detail from getById to get fresh volunteers + socialHours
      const fresh = await activitiesApi.get(activity.id);
      setDetail(fresh);
      toast.success(
        `${updated.volunteers?.length ?? selectedIds.size} voluntario(s) asignado(s)`,
      );
      setManageMode(false);
      onVolunteersChanged?.();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  const hoursByVolunteer = useMemo(() => {
    const map = new Map<
      string,
      { name: string; studentId: string; total: number; admin: number; field: number; records: number }
    >();
    (detail?.socialHours ?? []).forEach((h) => {
      const v = h.volunteer;
      if (!v) return;
      const existing = map.get(v.id) ?? {
        name: v.name,
        studentId: v.studentId,
        total: 0,
        admin: 0,
        field: 0,
        records: 0,
      };
      existing.total += h.hours;
      if (h.type === "admin") existing.admin += h.hours;
      else existing.field += h.hours;
      existing.records += 1;
      map.set(v.id, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [detail]);

  const totalHours = hoursByVolunteer.reduce((s, v) => s + v.total, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const maxVolunteerHours = Math.max(...hoursByVolunteer.map((v) => v.total), 1);

  const cc = committeeColorClass(activity?.committee?.color);
  // Prefer detail.volunteers (fresh after inline update) over activity.volunteers (parent prop)
  const volunteers = detail?.volunteers ?? activity?.volunteers ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-lg leading-snug pr-6">
            {activity?.title}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Detalle de la actividad
          </DialogDescription>
          {activity?.committee && (
            <Badge
              variant="secondary"
              className={cn("w-fit", cc.bg, cc.text)}
            >
              <span className={cn("size-1.5 rounded-full", cc.dot)} />
              {activity.committee.name}
            </Badge>
          )}
        </DialogHeader>

        {loading ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : !detail ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No se pudo cargar el detalle.
          </p>
        ) : (
          <div className="flex-1 overflow-y-auto scroll-thin -mx-1 px-1 space-y-4">
            {/* Description */}
            {detail.description && (
              <p className="text-sm text-muted-foreground leading-relaxed">
                {detail.description}
              </p>
            )}

            {/* Summary stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <SummaryStat
                icon={Clock}
                label="Horas"
                value={`${totalHours}h`}
                accent="emerald"
              />
              <SummaryStat
                icon={Users}
                label="Voluntarios"
                value={String(volunteers.length)}
                accent="sky"
              />
              <SummaryStat
                icon={CheckCircle2}
                label="Beneficiarios"
                value={String(
                  detail.beneficiariesMen + detail.beneficiariesWomen,
                )}
                accent="graphite"
              />
              <SummaryStat
                icon={TrendingDown}
                label="Gastos"
                value={formatCurrency(totalExpenses)}
                accent="rose"
              />
            </div>

            {/* Meta info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {detail.startDate && (
                <MetaItem icon={CalendarDays} label="Fecha">
                  {formatDate(detail.startDate)}
                  {detail.endDate && detail.endDate !== detail.startDate
                    ? ` → ${formatDate(detail.endDate)}`
                    : ""}
                </MetaItem>
              )}
              {detail.location && (
                <MetaItem icon={MapPin} label="Lugar">
                  {detail.location}
                </MetaItem>
              )}
              <MetaItem icon={Target} label="Tipo">
                {detail.type || "EduTECH ESEN"}
              </MetaItem>
              <MetaItem icon={Users} label="Género beneficiarios">
                {detail.beneficiariesMen} hombres · {detail.beneficiariesWomen} mujeres
              </MetaItem>
            </div>

            {/* ODS */}
            {detail.ods && detail.ods.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">
                  Objetivos de Desarrollo Sostenible
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {detail.ods.map((o) => (
                    <Badge
                      key={o}
                      variant="outline"
                      className="text-[10px] bg-primary/10"
                    >
                      {o}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Tabs */}
            <Tabs defaultValue="volunteers" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="volunteers">
                  Voluntarios
                  <Badge variant="secondary" className="ml-1.5 text-[10px] h-4 px-1.5">
                    {volunteers.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="hours">
                  Horas
                  <Badge variant="secondary" className="ml-1.5 text-[10px] h-4 px-1.5">
                    {hoursByVolunteer.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="expenses">
                  Gastos
                  <Badge variant="secondary" className="ml-1.5 text-[10px] h-4 px-1.5">
                    {expenses.length}
                  </Badge>
                </TabsTrigger>
              </TabsList>

              {/* Volunteers tab */}
              <TabsContent value="volunteers" className="mt-3 space-y-2">
                {manageMode ? (
                  <>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <p className="text-xs text-muted-foreground">
                        <UserPlus className="size-3.5 inline mr-1" />
                        Selecciona los voluntarios participantes
                      </p>
                      <Badge variant="secondary" className="text-[10px] tabular-nums">
                        {selectedIds.size} seleccionado(s)
                      </Badge>
                    </div>
                    <ul className="space-y-1 max-h-72 overflow-y-auto scroll-thin border rounded-lg p-1.5">
                      {allVolunteers.map((v) => {
                        const checked = selectedIds.has(v.id);
                        return (
                          <li key={v.id}>
                            <button
                              type="button"
                              onClick={() => toggleVolunteer(v.id)}
                              className={cn(
                                "w-full flex items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors",
                                checked
                                  ? "bg-accent"
                                  : "hover:bg-muted/60",
                              )}
                            >
                              <span
                                className={cn(
                                  "size-5 rounded border flex items-center justify-center shrink-0 transition-colors",
                                  checked
                                    ? "bg-primary border-primary text-primary-foreground"
                                    : "border-muted-foreground/30",
                                )}
                              >
                                {checked && <CheckCircle2 className="size-3.5" />}
                              </span>
                              <span className="size-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
                                {v.name.charAt(0).toUpperCase()}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate flex items-center gap-1.5">
                                  {v.name}
                                  {v.role === "admin" && (
                                    <Badge variant="secondary" className="text-[10px] h-4 px-1">
                                      Admin
                                    </Badge>
                                  )}
                                </p>
                                <p className="text-xs text-muted-foreground font-mono truncate">
                                  {v.studentId} · {v.career}
                                </p>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        type="button"
                        size="sm"
                        onClick={saveVolunteers}
                        disabled={saving}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground"
                      >
                        {saving ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Save className="size-3.5" />
                        )}
                        Guardar cambios
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setManageMode(false);
                          setSelectedIds(
                            new Set((detail?.volunteers ?? []).map((v) => v.id)),
                          );
                        }}
                        disabled={saving}
                      >
                        <X className="size-3.5" />
                        Cancelar
                      </Button>
                    </div>
                  </>
                ) : volunteers.length === 0 ? (
                  <EmptyTabState
                    icon={Users}
                    title="Sin voluntarios asignados"
                    description={
                      isAdmin
                        ? "Haz clic en 'Gestionar' para asignar voluntarios a esta actividad."
                        : "Asigna voluntarios a esta actividad desde la edición."
                    }
                    action={
                      isAdmin ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setManageMode(true)}
                          className="mt-3"
                        >
                          <UserPlus className="size-3.5" />
                          Gestionar voluntarios
                        </Button>
                      ) : undefined
                    }
                  />
                ) : (
                  <>
                    {isAdmin && (
                      <div className="flex justify-end mb-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setManageMode(true)}
                        >
                          <Pencil className="size-3.5" />
                          Gestionar voluntarios
                        </Button>
                      </div>
                    )}
                    <ul className="space-y-1.5">
                      {volunteers.map((v) => {
                        const hours = hoursByVolunteer.find(
                          (h) => h.studentId === v.studentId,
                        );
                        return (
                          <li
                            key={v.id}
                            className="flex items-center gap-3 rounded-lg border px-3 py-2 hover:bg-muted/40 transition-colors"
                          >
                            <span className="size-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
                              {v.name.charAt(0).toUpperCase()}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate flex items-center gap-1.5">
                                {v.name}
                                {v.role === "admin" && (
                                  <Badge variant="secondary" className="text-[10px] h-4 px-1">
                                    Admin
                                  </Badge>
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground font-mono truncate">
                                {v.studentId} · {v.career}
                              </p>
                            </div>
                            {hours && (
                              <Badge
                                variant="secondary"
                                className="bg-primary/10 text-primary shrink-0"
                              >
                                {hours.total}h
                              </Badge>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </TabsContent>

              {/* Hours tab */}
              <TabsContent value="hours" className="mt-3 space-y-2">
                {hoursByVolunteer.length === 0 ? (
                  <EmptyTabState
                    icon={Clock}
                    title="Sin horas registradas"
                    description="Aún no se han registrado horas sociales para esta actividad."
                  />
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-2 mb-2">
                      <MiniStat
                        icon={Briefcase}
                        label="Admin"
                        value={`${hoursByVolunteer.reduce(
                          (s, v) => s + v.admin,
                          0,
                        )}h`}
                        accent="emerald"
                      />
                      <MiniStat
                        icon={MapPinned}
                        label="Campo"
                        value={`${hoursByVolunteer.reduce(
                          (s, v) => s + v.field,
                          0,
                        )}h`}
                        accent="sky"
                      />
                      <MiniStat
                        icon={Clock}
                        label="Total"
                        value={`${totalHours}h`}
                        accent="graphite"
                      />
                    </div>
                    <ul className="space-y-2">
                      {hoursByVolunteer.map((v) => (
                        <li
                          key={v.studentId}
                          className="rounded-lg border px-3 py-2 space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">
                                {v.name}
                              </p>
                              <p className="text-xs text-muted-foreground font-mono">
                                {v.studentId} · {v.records} registro(s)
                              </p>
                            </div>
                            <span className="text-sm font-semibold tabular-nums shrink-0">
                              {v.total}h
                            </span>
                          </div>
                          <Progress
                            value={(v.total / maxVolunteerHours) * 100}
                            className="h-1.5"
                          />
                          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Briefcase className="size-3" /> {v.admin}h admin
                            </span>
                            <span className="flex items-center gap-1">
                              <MapPinned className="size-3" /> {v.field}h campo
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </TabsContent>

              {/* Expenses tab */}
              <TabsContent value="expenses" className="mt-3 space-y-2">
                {expenses.length === 0 ? (
                  <EmptyTabState
                    icon={Wallet}
                    title="Sin gastos asociados"
                    description="No se han registrado gastos vinculados a esta actividad."
                  />
                ) : (
                  <>
                    <Card className="ring-1 ring-rose-500/20 mb-2">
                      <CardContent className="p-3 flex items-center gap-3">
                        <div className="size-9 rounded-lg bg-rose-500/10 text-rose-600 flex items-center justify-center shrink-0">
                          <TrendingDown className="size-4" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Total gastado en esta actividad
                          </p>
                          <p className="text-lg font-bold text-rose-700 dark:text-rose-400">
                            {formatCurrency(totalExpenses)}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                    <ul className="space-y-1.5">
                      {expenses.map((e) => (
                        <li
                          key={e.id}
                          className="rounded-lg border px-3 py-2 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {e.concept}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {formatDate(e.date)} · {e.category || "Sin categoría"}
                              {e.beneficiary ? ` · ${e.beneficiary}` : ""}
                            </p>
                          </div>
                          <span className="text-sm font-semibold tabular-nums text-rose-700 dark:text-rose-400 shrink-0">
                            {formatCurrency(e.amount)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SummaryStat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  accent: "emerald" | "sky" | "graphite" | "rose";
}) {
  const styles: Record<string, string> = {
    emerald: "bg-primary/10 text-primary",
    sky: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
    graphite: "bg-graphite-500/10 text-graphite-700 dark:text-graphite-400",
    rose: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
  };
  return (
    <div className="rounded-lg border bg-card p-2.5">
      <div
        className={cn(
          "size-7 rounded-md flex items-center justify-center mb-1.5",
          styles[accent],
        )}
      >
        <Icon className="size-3.5" />
      </div>
      <p className="text-[10px] font-medium text-muted-foreground leading-tight">
        {label}
      </p>
      <p className="text-base font-bold tabular-nums truncate">{value}</p>
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  accent: "emerald" | "sky" | "graphite";
}) {
  const styles: Record<string, string> = {
    emerald: "text-primary",
    sky: "text-sky-700 dark:text-sky-400",
    graphite: "text-graphite-700 dark:text-graphite-400",
  };
  return (
    <div className="rounded-lg border px-2 py-1.5 text-center">
      <div className={cn("flex items-center justify-center gap-1 text-[10px] font-medium", styles[accent])}>
        <Icon className="size-3" />
        {label}
      </div>
      <p className="text-sm font-bold tabular-nums mt-0.5">{value}</p>
    </div>
  );
}

function MetaItem({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Clock;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg border bg-muted/30 px-2.5 py-1.5">
      <Icon className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
          {label}
        </p>
        <p className="text-xs font-medium truncate">{children}</p>
      </div>
    </div>
  );
}

function EmptyTabState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof Clock;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center py-8 text-center"
    >
      <div className="size-10 rounded-xl bg-muted flex items-center justify-center mb-2">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground max-w-xs mt-0.5">
        {description}
      </p>
      {action}
    </motion.div>
  );
}
