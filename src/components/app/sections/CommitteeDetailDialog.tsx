"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Users,
  Clock,
  CalendarDays,
  GraduationCap,
  Briefcase,
  MapPinned,
  Target,
  CheckCircle2,
  Loader2,
  Network,
  School,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
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
  committeesApi,
  socialHoursApi,
  committeeColorClass,
  formatDate,
  type Committee,
  type Activity,
  type ClassItem,
  type Volunteer,
  type SocialHour,
} from "@/lib/api";
import { cn } from "@/lib/utils";

interface CommitteeDetailDialogProps {
  committee: Committee | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CommitteeDetail extends Committee {
  members?: Volunteer[];
  activities?: Activity[];
  classes?: ClassItem[];
}

export function CommitteeDetailDialog({
  committee,
  open,
  onOpenChange,
}: CommitteeDetailDialogProps) {
  const [detail, setDetail] = useState<CommitteeDetail | null>(null);
  const [allHours, setAllHours] = useState<SocialHour[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !committee) {
      setDetail(null);
      setAllHours([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      committeesApi.get(committee.id),
      socialHoursApi.list(),
    ])
      .then(([d, hours]) => {
        if (cancelled) return;
        setDetail(d);
        // filter hours to only those belonging to members of this committee
        const memberIds = new Set((d.members ?? []).map((m) => m.id));
        setAllHours(hours.filter((h) => memberIds.has(h.volunteerId)));
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        toast.error(
          e instanceof Error ? e.message : "Error al cargar detalle del comité",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, committee]);

  // Compute hours per member
  const hoursByMember = useMemo(() => {
    const map = new Map<
      string,
      { total: number; admin: number; field: number; records: number }
    >();
    allHours.forEach((h) => {
      const e = map.get(h.volunteerId) ?? { total: 0, admin: 0, field: 0, records: 0 };
      e.total += h.hours;
      if (h.type === "admin") e.admin += h.hours;
      else e.field += h.hours;
      e.records += 1;
      map.set(h.volunteerId, e);
    });
    return map;
  }, [allHours]);

  const totalHours = Array.from(hoursByMember.values()).reduce((s, v) => s + v.total, 0);
  const totalAdmin = Array.from(hoursByMember.values()).reduce((s, v) => s + v.admin, 0);
  const totalField = Array.from(hoursByMember.values()).reduce((s, v) => s + v.field, 0);

  const members = detail?.members ?? [];
  const activities = detail?.activities ?? [];
  const classes = detail?.classes ?? [];

  const cc = committeeColorClass(committee?.color);
  const maxMemberHours = Math.max(
    ...members.map((m) => hoursByMember.get(m.id)?.total ?? 0),
    1,
  );

  // total beneficiaries across activities
  const totalBeneficiaries = activities.reduce(
    (s, a) => s + (a.beneficiariesMen || 0) + (a.beneficiariesWomen || 0),
    0,
  );

  // Helper: parse ods (DB stores as comma-separated string, API returns array)
  function parseOds(ods: string[] | string | undefined | null): string[] {
    if (!ods) return [];
    if (Array.isArray(ods)) return ods;
    return String(ods)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-lg leading-snug pr-6 flex items-center gap-2">
            <span className={cn("size-3 rounded-full", cc.dot)} />
            {committee?.name}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Detalle del comité
          </DialogDescription>
          {committee?.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {committee.description}
            </p>
          )}
          <Badge
            variant="secondary"
            className={cn("w-fit", cc.bg, cc.text)}
          >
            <Network className="size-3" />
            Comité · {members.length} miembro(s)
          </Badge>
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
            {/* Summary stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <SummaryStat
                icon={Users}
                label="Miembros"
                value={String(members.length)}
                accent="sky"
              />
              <SummaryStat
                icon={Clock}
                label="Horas"
                value={`${totalHours}h`}
                accent="emerald"
              />
              <SummaryStat
                icon={CalendarDays}
                label="Actividades"
                value={String(activities.length)}
                accent="graphite"
              />
              <SummaryStat
                icon={GraduationCap}
                label="Clases"
                value={String(classes.length)}
                accent="violet"
              />
            </div>

            {/* Hours breakdown */}
            <Card className="ring-1 ring-primary/15">
              <CardContent className="p-3 grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="flex items-center justify-center gap-1 text-[10px] font-medium text-graphite-700 dark:text-graphite-400">
                    <Briefcase className="size-3" /> Administrativas
                  </div>
                  <p className="text-base font-bold tabular-nums mt-0.5">{totalAdmin}h</p>
                </div>
                <div className="border-x">
                  <div className="flex items-center justify-center gap-1 text-[10px] font-medium text-primary">
                    <MapPinned className="size-3" /> Campo
                  </div>
                  <p className="text-base font-bold tabular-nums mt-0.5">{totalField}h</p>
                </div>
                <div>
                  <div className="flex items-center justify-center gap-1 text-[10px] font-medium text-sky-700 dark:text-sky-400">
                    <CheckCircle2 className="size-3" /> Beneficiarios
                  </div>
                  <p className="text-base font-bold tabular-nums mt-0.5">{totalBeneficiaries}</p>
                </div>
              </CardContent>
            </Card>

            {/* Tabs */}
            <Tabs defaultValue="members" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="members">
                  Miembros
                  <Badge variant="secondary" className="ml-1.5 text-[10px] h-4 px-1.5">
                    {members.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="activities">
                  Actividades
                  <Badge variant="secondary" className="ml-1.5 text-[10px] h-4 px-1.5">
                    {activities.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="classes">
                  Clases
                  <Badge variant="secondary" className="ml-1.5 text-[10px] h-4 px-1.5">
                    {classes.length}
                  </Badge>
                </TabsTrigger>
              </TabsList>

              {/* Members tab */}
              <TabsContent value="members" className="mt-3 space-y-2">
                {members.length === 0 ? (
                  <EmptyTabState
                    icon={Users}
                    title="Sin miembros"
                    description="Este comité aún no tiene voluntarios asignados."
                  />
                ) : (
                  <ul className="space-y-2">
                    {members
                      .slice()
                      .sort(
                        (a, b) =>
                          (hoursByMember.get(b.id)?.total ?? 0) -
                          (hoursByMember.get(a.id)?.total ?? 0),
                      )
                      .map((m, idx) => {
                        const h = hoursByMember.get(m.id);
                        return (
                          <li
                            key={m.id}
                            className="rounded-lg border px-3 py-2 space-y-1.5 hover:bg-muted/40 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className={cn(
                                  "size-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0",
                                  idx === 0 && h?.total
                                    ? "bg-graphite-100 text-graphite-700 dark:bg-graphite-950 dark:text-graphite-300"
                                    : "bg-primary/15 text-primary",
                                )}
                              >
                                {m.name.charAt(0).toUpperCase()}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate flex items-center gap-1.5">
                                  {m.name}
                                  {m.role === "admin" && (
                                    <Badge variant="secondary" className="text-[10px] h-4 px-1">
                                      Admin
                                    </Badge>
                                  )}
                                </p>
                                <p className="text-xs text-muted-foreground font-mono truncate">
                                  {m.studentId} · {m.career}
                                </p>
                              </div>
                              {h && (
                                <Badge
                                  variant="secondary"
                                  className="bg-primary/10 text-primary shrink-0 tabular-nums"
                                >
                                  {h.total}h
                                </Badge>
                              )}
                            </div>
                            {h && h.total > 0 && (
                              <>
                                <Progress
                                  value={(h.total / maxMemberHours) * 100}
                                  className="h-1.5"
                                />
                                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Briefcase className="size-3" /> {h.admin}h admin
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <MapPinned className="size-3" /> {h.field}h campo
                                  </span>
                                  <span className="ml-auto">{h.records} registro(s)</span>
                                </div>
                              </>
                            )}
                          </li>
                        );
                      })}
                  </ul>
                )}
              </TabsContent>

              {/* Activities tab */}
              <TabsContent value="activities" className="mt-3 space-y-2">
                {activities.length === 0 ? (
                  <EmptyTabState
                    icon={CalendarDays}
                    title="Sin actividades"
                    description="Este comité no tiene actividades registradas."
                  />
                ) : (
                  <ul className="space-y-2">
                    {activities.map((a) => (
                      <li
                        key={a.id}
                        className="rounded-lg border px-3 py-2 hover:bg-muted/40 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{a.title}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {formatDate(a.startDate)}
                              {a.endDate && a.endDate !== a.startDate
                                ? ` → ${formatDate(a.endDate)}`
                                : ""}{" "}
                              · {a.location || "Sin lugar"}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {a.hours}h
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Target className="size-3" /> {a.type || "General"}
                          </span>
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="size-3" />
                            {(a.beneficiariesMen || 0) + (a.beneficiariesWomen || 0)} beneficiarios
                          </span>
                        </div>
                        {a.ods && parseOds(a.ods).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {parseOds(a.ods).slice(0, 3).map((o) => (
                              <Badge
                                key={o}
                                variant="outline"
                                className="text-[10px] bg-primary/10"
                              >
                                {o}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>

              {/* Classes tab */}
              <TabsContent value="classes" className="mt-3 space-y-2">
                {classes.length === 0 ? (
                  <EmptyTabState
                    icon={GraduationCap}
                    title="Sin clases"
                    description="Este comité no ha impartido clases."
                  />
                ) : (
                  <ul className="space-y-2">
                    {classes.map((c) => (
                      <li
                        key={c.id}
                        className="rounded-lg border px-3 py-2 hover:bg-muted/40 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate flex items-center gap-1.5">
                              <School className="size-3.5 text-violet-600 dark:text-violet-400 shrink-0" />
                              {c.title}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {formatDate(c.date)} · {c.school || "Sin escuela"}
                              {c.topic ? ` · ${c.topic}` : ""}
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className="text-[10px] shrink-0 bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
                          >
                            {c.durationHours}h
                          </Badge>
                        </div>
                        {c.instructors && c.instructors.length > 0 && (
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            <Users className="size-3 text-muted-foreground" />
                            {c.instructors.map((ins) => (
                              <Badge
                                key={ins.id}
                                variant="secondary"
                                className="text-[10px] h-4 px-1.5"
                              >
                                {ins.name}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
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
  accent: "emerald" | "sky" | "graphite" | "violet";
}) {
  const styles: Record<string, string> = {
    emerald: "bg-primary/10 text-primary",
    sky: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
    graphite: "bg-graphite-500/10 text-graphite-700 dark:text-graphite-400",
    violet: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
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

function EmptyTabState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Clock;
  title: string;
  description: string;
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
      <p className="text-xs text-muted-foreground max-w-xs mt-0.5">{description}</p>
    </motion.div>
  );
}
