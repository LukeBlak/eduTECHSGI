"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  CalendarDays,
  MapPin,
  Clock,
  Users,
  CheckCircle2,
  Loader2,
  Search,
  Eye,
  X,
  UserPlus,
  UserMinus,
  Bookmark,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { ActivityDetailDialog } from "./ActivityDetailDialog";
import {
  activitiesApi,
  volunteersApi,
  committeesApi,
  committeeColorClass,
  formatDate,
  isPrivileged as isPrivilegedRole,
  type Activity,
  type AuthUser,
  type Volunteer,
  type Committee,
  type HourType,
  type SubscriptionStatus,
} from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { SectionHeader, EmptyState, Highlight } from "../Shared";
import { useRealtimeRefresh } from "../realtime/RealtimeProvider";
import { cn } from "@/lib/utils";

const ODS_OPTIONS = [
  "ODS 1 - Fin de la Pobreza",
  "ODS 2 - Hambre Cero",
  "ODS 3 - Salud y Bienestar",
  "ODS 4 - Educación de Calidad",
  "ODS 5 - Igualdad de Género",
  "ODS 8 - Trabajo Decente y Crecimiento Económico",
  "ODS 9 - Industria, Innovación e Infraestructura",
  "ODS 10 - Reducción de las Desigualdades",
  "ODS 11 - Ciudades y Comunidades Sostenibles",
  "ODS 13 - Acción por el Clima",
  "ODS 16 - Paz, Justicia e Instituciones Sólidas",
  "ODS 17 - Alianzas para Lograr los Objetivos",
];

type TabValue = "all" | "mine";

/** Actividad retornada por /activities/mine con status y fecha de suscripción. */
type MineActivity = Activity & {
  subscriptionStatus: SubscriptionStatus;
  subscribedAt: string;
};

/**
 * Obtiene el estado de suscripción del usuario actual en una actividad.
 * - En "Mis actividades" el status viene en el top level (MineActivity).
 * - En "Todas" hay que buscarlo dentro del array `volunteers`.
 */
function getSubscriptionStatus(
  activity: Activity,
  userId?: string,
): SubscriptionStatus | undefined {
  if (!userId) return undefined;
  const top = (activity as MineActivity).subscriptionStatus;
  if (top === "registered" || top === "waitlist" || top === "cancelled") {
    return top;
  }
  return activity.volunteers?.find((v) => v.id === userId)?.subscriptionStatus;
}

/** Aplica el cambio optimista al inscribirse (prediciendo registered vs waitlist). */
function applySubscribeOptimistic<T extends Activity>(
  activity: T,
  userId: string,
  user: AuthUser | null,
  predictedStatus: SubscriptionStatus,
): T {
  const others = activity.volunteers?.filter((v) => v.id !== userId) ?? [];
  const newVolunteer: Volunteer & { subscriptionStatus: SubscriptionStatus } = {
    id: userId,
    name: user?.name ?? "",
    studentId: user?.studentId ?? "",
    career: user?.career ?? "",
    role: user?.role ?? "volunteer",
    email: user?.email,
    phone: user?.phone,
    committeeId: user?.committeeId ?? null,
    committee: user?.committee ?? null,
    subscriptionStatus: predictedStatus,
  };
  const wasRegistered =
    activity.volunteers?.find((v) => v.id === userId)?.subscriptionStatus ===
    "registered";
  const increment = predictedStatus === "registered" && !wasRegistered ? 1 : 0;
  return {
    ...activity,
    volunteers: [...others, newVolunteer],
    registeredCount: (activity.registeredCount ?? 0) + increment,
    available:
      activity.capacity != null
        ? Math.max(0, (activity.available ?? 0) - increment)
        : null,
    capacityFull:
      activity.capacity != null
        ? (activity.registeredCount ?? 0) + increment >= activity.capacity
        : activity.capacityFull,
  };
}

/** Aplica el cambio optimista al desinscribirse. */
function applyUnsubscribeOptimistic<T extends Activity>(
  activity: T,
  userId: string,
): T {
  const wasRegistered =
    activity.volunteers?.find((v) => v.id === userId)?.subscriptionStatus ===
    "registered";
  return {
    ...activity,
    volunteers: activity.volunteers?.filter((v) => v.id !== userId),
    registeredCount: wasRegistered
      ? Math.max(0, (activity.registeredCount ?? 0) - 1)
      : activity.registeredCount,
    available:
      activity.capacity != null && wasRegistered
        ? (activity.available ?? 0) + 1
        : activity.available,
    capacityFull: wasRegistered ? false : activity.capacityFull,
  };
}

export function ActividadesSection() {
  const { user } = useAuthStore();
  const isAdmin = isPrivilegedRole(user?.role);
  const userId = user?.id;

  const [tab, setTab] = useState<TabValue>("all");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [mineActivities, setMineActivities] = useState<MineActivity[]>([]);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMine, setLoadingMine] = useState(false);
  const [subLoading, setSubLoading] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Activity | null>(null);
  const [detailTarget, setDetailTarget] = useState<Activity | null>(null);
  const [completeTarget, setCompleteTarget] = useState<Activity | null>(null);
  const [completing, setCompleting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [acts, vols, coms] = await Promise.all([
        activitiesApi.list(),
        volunteersApi.list(),
        committeesApi.list(),
      ]);
      setActivities(acts);
      setVolunteers(vols);
      setCommittees(coms);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al cargar actividades");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMine = useCallback(async () => {
    setLoadingMine(true);
    try {
      const mine = await activitiesApi.mine();
      setMineActivities(mine);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al cargar tus actividades");
    } finally {
      setLoadingMine(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ─── Realtime: refrescar lista cuando cambia cualquier actividad ───
  useRealtimeRefresh(
    [
      "activity:created",
      "activity:updated",
      "activity:deleted",
      "activity:subscribed",
      "activity:unsubscribed",
    ],
    () => {
      load();
      if (tab === "mine") loadMine();
    },
    400,
  );

  useEffect(() => {
    if (tab === "mine") {
      loadMine();
    }
  }, [tab, loadMine]);

  // Lista activa según el tab seleccionado
  const activeList: Activity[] = useMemo(() => {
    return tab === "mine" ? mineActivities : activities;
  }, [tab, activities, mineActivities]);

  const filtered = useMemo(() => {
    const norm = (s: string) =>
      s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const q = norm(search.trim());
    if (!q) return activeList;
    return activeList.filter(
      (a) =>
        norm(a.title).includes(q) ||
        norm(a.description || "").includes(q) ||
        norm(a.location || "").includes(q),
    );
  }, [activeList, search]);

  // --- Subscribe / Unsubscribe ---
  async function handleSubscribe(activity: Activity) {
    if (!userId) return;
    const predictedStatus: SubscriptionStatus =
      activity.capacity != null && (activity.available ?? 0) <= 0
        ? "waitlist"
        : "registered";

    // Update optimista en la lista activa
    if (tab === "mine") {
      setMineActivities((prev) =>
        prev.map((a) =>
          a.id === activity.id
            ? (applySubscribeOptimistic(a, userId, user, predictedStatus) as MineActivity)
            : a,
        ),
      );
    } else {
      setActivities((prev) =>
        prev.map((a) =>
          a.id === activity.id
            ? applySubscribeOptimistic(a, userId, user, predictedStatus)
            : a,
        ),
      );
    }

    setSubLoading((s) => ({ ...s, [activity.id]: true }));
    try {
      const res = await activitiesApi.subscribe(activity.id);
      toast.success(res.message);
      // Refrescar estado canónico
      if (tab === "mine") {
        await loadMine();
      } else {
        await load();
      }
    } catch (e: unknown) {
      // Revertir al estado original
      if (tab === "mine") {
        setMineActivities((prev) =>
          prev.map((a) => (a.id === activity.id ? (activity as MineActivity) : a)),
        );
      } else {
        setActivities((prev) =>
          prev.map((a) => (a.id === activity.id ? activity : a)),
        );
      }
      toast.error(e instanceof Error ? e.message : "Error al inscribirse");
    } finally {
      setSubLoading((s) => {
        const next = { ...s };
        delete next[activity.id];
        return next;
      });
    }
  }

  async function handleUnsubscribe(activity: Activity) {
    if (!userId) return;

    // En "mine" quitamos la tarjeta de la vista (el endpoint mine() ya no la devolverá)
    if (tab === "mine") {
      setMineActivities((prev) => prev.filter((a) => a.id !== activity.id));
    } else {
      setActivities((prev) =>
        prev.map((a) =>
          a.id === activity.id ? applyUnsubscribeOptimistic(a, userId) : a,
        ),
      );
    }

    setSubLoading((s) => ({ ...s, [activity.id]: true }));
    try {
      const res = await activitiesApi.unsubscribe(activity.id);
      toast.success(res.message);
      if (tab === "mine") {
        await loadMine();
      } else {
        await load();
      }
    } catch (e: unknown) {
      // Revertir
      if (tab === "mine") {
        setMineActivities((prev) => [...prev, activity as MineActivity]);
      } else {
        setActivities((prev) =>
          prev.map((a) => (a.id === activity.id ? activity : a)),
        );
      }
      toast.error(e instanceof Error ? e.message : "Error al cancelar inscripción");
    } finally {
      setSubLoading((s) => {
        const next = { ...s };
        delete next[activity.id];
        return next;
      });
    }
  }

  async function handleDelete(a: Activity) {
    try {
      await activitiesApi.remove(a.id);
      toast.success("Actividad eliminada");
      setDeleteTarget(null);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    }
  }

  async function handleComplete(a: Activity) {
    setCompleting(true);
    try {
      const res = await activitiesApi.complete(a.id);
      if (res.alreadyCompleted) {
        toast.info("Esta actividad ya había sido finalizada");
      } else {
        toast.success(
          `${res.message} (${res.assignedCount} voluntario(s) · ${res.hoursPerVolunteer}h ${
            res.hourType === "admin" ? "administrativas" : "de campo"
          })`,
        );
      }
      setCompleteTarget(null);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al finalizar actividad");
    } finally {
      setCompleting(false);
    }
  }

  const isLoadingView = loading || (tab === "mine" && loadingMine);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-5"
    >
      <SectionHeader
        title="Actividades"
        description={`${activeList.length} actividad(es) ${tab === "mine" ? "inscrita(s)" : "registrada(s)"}`}
        action={
          isAdmin ? (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              className="bg-primary hover:bg-primary/90 text-primary-foreground h-11"
            >
              <Plus className="size-4" /> Nueva actividad
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
          <TabsList className="grid w-full sm:w-fit grid-cols-2">
            <TabsTrigger value="all">
              <CalendarDays className="size-3.5" />
              Todas las actividades
            </TabsTrigger>
            <TabsTrigger value="mine">
              <Bookmark className="size-3.5" />
              Mis actividades
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar actividades..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10"
            aria-label="Buscar actividades"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Limpiar búsqueda"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 size-6 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {isLoadingView ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-0">
            <EmptyState
              icon={tab === "mine" ? Bookmark : CalendarDays}
              title={tab === "mine" ? "Sin inscripciones" : "Sin actividades"}
              description={
                tab === "mine"
                  ? "Aún no estás inscrito en ninguna actividad. Explora las actividades disponibles en la pestaña 'Todas las actividades'."
                  : "Crea la primera actividad de la asociación."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((a) => (
            <ActivityCard
              key={a.id}
              activity={a}
              search={search}
              userId={userId}
              isAdmin={isAdmin}
              subLoading={!!subLoading[a.id]}
              onEdit={(act) => {
                setEditing(act);
                setFormOpen(true);
              }}
              onDelete={(act) => setDeleteTarget(act)}
              onDetail={(act) => setDetailTarget(act)}
              onSubscribe={(act) => handleSubscribe(act)}
              onUnsubscribe={(act) => handleUnsubscribe(act)}
              onComplete={(act) => setCompleteTarget(act)}
            />
          ))}
        </div>
      )}

      <ActivityFormDialog
        open={formOpen}
        editing={editing}
        volunteers={volunteers}
        committees={committees}
        onOpenChange={setFormOpen}
        submitting={submitting}
        onSubmit={async (data) => {
          setSubmitting(true);
          try {
            if (editing) {
              await activitiesApi.update(editing.id, data);
              toast.success("Actividad actualizada");
            } else {
              await activitiesApi.create(
                data as Parameters<typeof activitiesApi.create>[0],
              );
              toast.success("Actividad creada");
            }
            setFormOpen(false);
            setEditing(null);
            load();
          } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Error al guardar");
          } finally {
            setSubmitting(false);
          }
        }}
      />

      <ActivityDetailDialog
        activity={detailTarget}
        open={!!detailTarget}
        onOpenChange={(o) => !o && setDetailTarget(null)}
        onVolunteersChanged={load}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar actividad?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente{" "}
              <span className="font-medium">{deleteTarget?.title}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!completeTarget}
        onOpenChange={(o) => !o && setCompleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Finalizar actividad?</AlertDialogTitle>
            <AlertDialogDescription>
              Se marcará como finalizada{" "}
              <span className="font-medium">{completeTarget?.title}</span> y se
              asignarán automáticamente{" "}
              <span className="font-medium">
                {completeTarget?.hours ?? 0} hora(s)
              </span>{" "}
              de tipo{" "}
              <span className="font-medium">
                {completeTarget?.hourType === "admin"
                  ? "administrativas"
                  : "de campo"}
              </span>{" "}
              a cada voluntario inscrito.
              <br />
              <br />
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={completing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={completing}
              onClick={() => completeTarget && handleComplete(completeTarget)}
            >
              {completing && <Loader2 className="size-4 animate-spin" />}
              Finalizar y asignar horas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}

// ============================================================================
// ActivityCard
// ============================================================================

interface ActivityCardProps {
  activity: Activity;
  search: string;
  userId?: string;
  isAdmin: boolean;
  subLoading: boolean;
  onEdit: (a: Activity) => void;
  onDelete: (a: Activity) => void;
  onDetail: (a: Activity) => void;
  onSubscribe: (a: Activity) => void;
  onUnsubscribe: (a: Activity) => void;
  onComplete: (a: Activity) => void;
}

function ActivityCard({
  activity,
  search,
  userId,
  isAdmin,
  subLoading,
  onEdit,
  onDelete,
  onDetail,
  onSubscribe,
  onUnsubscribe,
  onComplete,
}: ActivityCardProps) {
  const cc = committeeColorClass(activity.committee?.color);
  const subStatus = getSubscriptionStatus(activity, userId);
  const isRegistered = subStatus === "registered";
  const isWaitlist = subStatus === "waitlist";
  const isCompleted = activity.status === "completed";

  const capacity = activity.capacity;
  const registeredCount =
    activity.registeredCount ?? activity.volunteers?.length ?? 0;
  const available = activity.available;
  const isFull =
    capacity != null && (available === 0 || activity.capacityFull === true);

  // Color del badge de capacidad
  let capacityBadgeClass =
    "bg-muted/50 text-muted-foreground border-muted-foreground/20";
  if (capacity != null) {
    if ((available ?? 0) > 0) {
      capacityBadgeClass = "bg-primary/15 text-primary border-primary/30";
    } else {
      capacityBadgeClass =
        "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300";
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2 }}
    >
      <Card className={cn(
        "flex flex-col transition-all duration-200 hover:shadow-md hover:-translate-y-0.5",
        isCompleted ? "border-emerald-500/40 bg-emerald-50/30 dark:bg-emerald-950/10" : "hover:border-primary/40",
      )}>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base leading-snug">
              <Highlight text={activity.title} query={search} />
            </CardTitle>
            {isAdmin && (
              <div className="flex gap-1 shrink-0">
                {!isCompleted && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700"
                        onClick={() => onComplete(activity)}
                        aria-label="Finalizar actividad"
                      >
                        <CheckCircle2 className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      Finalizar y asignar horas a los inscritos
                    </TooltipContent>
                  </Tooltip>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => onEdit(activity)}
                  aria-label="Editar"
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-destructive"
                  onClick={() => onDelete(activity)}
                  aria-label="Eliminar"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {isCompleted && (
              <Badge className="bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 dark:text-emerald-300">
                <CheckCircle2 className="size-3" />
                Finalizada
              </Badge>
            )}
            {isRegistered && (
              <Badge className="bg-primary/15 text-primary border border-primary/30">
                <CheckCircle2 className="size-3" />
                Inscrito
              </Badge>
            )}
            {isWaitlist && (
              <Badge className="bg-amber-500/15 text-amber-700 border border-amber-500/30 dark:text-amber-300">
                <Clock className="size-3" />
                En espera
              </Badge>
            )}
            {activity.committee && (
              <Badge
                variant="secondary"
                className={cn("w-fit", cc.bg, cc.text)}
              >
                <span className={cn("size-1.5 rounded-full", cc.dot)} />
                {activity.committee.name}
              </Badge>
            )}
            {activity.hourType && (
              <Badge
                variant="outline"
                className="text-[10px] bg-muted/40"
              >
                {activity.hourType === "admin" ? "Administrativas" : "De campo"}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex-1 space-y-3">
          {activity.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              <Highlight text={activity.description} query={search} />
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <CalendarDays className="size-3.5" />
              {formatDate(activity.startDate)}
              {activity.endDate && activity.endDate !== activity.startDate
                ? ` → ${formatDate(activity.endDate)}`
                : ""}
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="size-3.5" />
              {activity.hours} hora(s)
            </div>
            {activity.location && (
              <div className="flex items-center gap-1.5 text-muted-foreground col-span-2">
                <MapPin className="size-3.5" />
                <span className="truncate">
                  <Highlight text={activity.location} query={search} />
                </span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <CheckCircle2 className="size-3.5" />
              {activity.beneficiariesMen + activity.beneficiariesWomen} beneficiario(s)
            </div>
          </div>
          {/* Capacidad */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge
              variant="outline"
              className={cn("text-[10px] gap-1 tabular-nums", capacityBadgeClass)}
            >
              <Users className="size-3" />
              {capacity != null ? `${registeredCount}/${capacity}` : "Sin límite"}
            </Badge>
            {isFull && (
              <Badge
                variant="outline"
                className="text-[10px] bg-rose-500/10 text-rose-700 border-rose-500/30 dark:text-rose-300"
              >
                Cupo lleno
              </Badge>
            )}
          </div>
          {activity.ods && activity.ods.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {activity.ods.map((o) => (
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
        </CardContent>
        <div className="px-6 pb-4 pt-0 flex gap-2 items-stretch">
          <Button
            variant="outline"
            size="sm"
            className="h-9 px-3 shrink-0"
            onClick={() => onDetail(activity)}
            aria-label="Ver detalle"
          >
            <Eye className="size-3.5" />
            <span className="hidden sm:inline">Detalle</span>
          </Button>
          {/* Botón principal de suscripción */}
          {isCompleted ? (
            <Button
              variant="outline"
              size="sm"
              className="h-9 flex-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
              disabled
            >
              <CheckCircle2 className="size-3.5" />
              Actividad finalizada
            </Button>
          ) : subLoading ? (
            <Button
              variant="outline"
              size="sm"
              className="h-9 flex-1"
              disabled
            >
              <Loader2 className="size-3.5 animate-spin" />
              Procesando…
            </Button>
          ) : isRegistered ? (
            <Button
              variant="outline"
              size="sm"
              className="h-9 flex-1 hover:bg-rose-500/10 hover:text-rose-700 hover:border-rose-500/40"
              onClick={() => onUnsubscribe(activity)}
            >
              <UserMinus className="size-3.5" />
              Cancelar inscripción
            </Button>
          ) : isWaitlist ? (
            <Button
              variant="outline"
              size="sm"
              className="h-9 flex-1 hover:bg-rose-500/10 hover:text-rose-700 hover:border-rose-500/40"
              onClick={() => onUnsubscribe(activity)}
            >
              <X className="size-3.5" />
              Salir de la lista
            </Button>
          ) : isFull ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 flex-1 border-amber-500/40 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300"
                  onClick={() => onSubscribe(activity)}
                >
                  <Clock className="size-3.5" />
                  Lista de espera
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Te inscribirás a la lista de espera; serás promovido si se libera un cupo.
              </TooltipContent>
            </Tooltip>
          ) : (
            <Button
              size="sm"
              className="h-9 flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
              onClick={() => onSubscribe(activity)}
            >
              <UserPlus className="size-3.5" />
              Inscribirme
            </Button>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

// ============================================================================
// ActivityFormDialog (con campo capacidad)
// ============================================================================

interface ActivityFormData {
  title: string;
  description?: string;
  objectives?: string;
  impact?: string;
  type?: string;
  startDate?: string;
  endDate?: string;
  location?: string;
  hours: number;
  hourType: HourType;
  capacity: number | null;
  beneficiariesMen: number;
  beneficiariesWomen: number;
  ods: string[];
  committeeId?: string | null;
  volunteerIds: string[];
}

function ActivityFormDialog({
  open,
  editing,
  volunteers,
  committees,
  onOpenChange,
  submitting,
  onSubmit,
}: {
  open: boolean;
  editing: Activity | null;
  volunteers: Volunteer[];
  committees: Committee[];
  onOpenChange: (o: boolean) => void;
  submitting: boolean;
  onSubmit: (data: ActivityFormData) => void | Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [objectives, setObjectives] = useState("");
  const [impact, setImpact] = useState("");
  const [type, setType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [location, setLocation] = useState("");
  const [hours, setHours] = useState("0");
  const [hourType, setHourType] = useState<HourType>("field");
  const [capacity, setCapacity] = useState("");
  const [benMen, setBenMen] = useState("0");
  const [benWomen, setBenWomen] = useState("0");
  const [ods, setOds] = useState<string[]>([]);
  const [committeeId, setCommitteeId] = useState("none");
  const [volunteerIds, setVolunteerIds] = useState<string[]>([]);
  const [volSearch, setVolSearch] = useState("");

  useEffect(() => {
    if (open) {
      setTitle(editing?.title || "");
      setDescription(editing?.description || "");
      setObjectives(editing?.objectives || "");
      setImpact(editing?.impact || "");
      setType(editing?.type || "");
      setStartDate(editing?.startDate ? editing.startDate.slice(0, 10) : new Date().toISOString().slice(0, 10));
      setEndDate(editing?.endDate ? editing.endDate.slice(0, 10) : new Date().toISOString().slice(0, 10));
      setLocation(editing?.location || "");
      setHours(String(editing?.hours ?? 0));
      setHourType((editing?.hourType as HourType) || "field");
      setCapacity(
        editing?.capacity != null ? String(editing.capacity) : "",
      );
      setBenMen(String(editing?.beneficiariesMen ?? 0));
      setBenWomen(String(editing?.beneficiariesWomen ?? 0));
      setOds(editing?.ods || []);
      setCommitteeId(editing?.committeeId || "none");
      setVolunteerIds(editing?.volunteers?.map((v) => v.id) || []);
      setVolSearch("");
    }
  }, [open, editing]);

  function toggleVolunteer(id: string) {
    setVolunteerIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleOds(o: string) {
    setOds((prev) =>
      prev.includes(o) ? prev.filter((x) => x !== o) : [...prev, o],
    );
  }

  const filteredVols = useMemo(() => {
    const q = volSearch.trim().toLowerCase();
    if (!q) return volunteers;
    return volunteers.filter(
      (v) =>
        v.name.toLowerCase().includes(q) || v.studentId.includes(q),
    );
  }, [volunteers, volSearch]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (title.trim().length < 3) {
      toast.error("El título debe tener al menos 3 caracteres");
      return;
    }
    const trimmedCapacity = capacity.trim();
    const capacityNum: number | null =
      trimmedCapacity === ""
        ? null
        : Math.max(1, Number(trimmedCapacity) || 1);
    onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      objectives: objectives.trim() || undefined,
      impact: impact.trim() || undefined,
      type: type.trim() || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      location: location.trim() || undefined,
      hours: Number(hours) || 0,
      hourType,
      capacity: capacityNum,
      beneficiariesMen: Number(benMen) || 0,
      beneficiariesWomen: Number(benWomen) || 0,
      ods,
      committeeId: committeeId === "none" ? null : committeeId,
      volunteerIds,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto scroll-thin">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar actividad" : "Nueva actividad"}
          </DialogTitle>
          <DialogDescription>
            Completa los datos de la actividad, beneficiarios y ODS relacionados.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="a-title">Título</Label>
            <Input
              id="a-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="a-desc">Descripción</Label>
            <Textarea
              id="a-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="a-obj">Objetivos</Label>
              <Textarea
                id="a-obj"
                value={objectives}
                onChange={(e) => setObjectives(e.target.value)}
                rows={3}
                placeholder="Objetivos del proyecto (para Memoria de Labores)…"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="a-impact">Impacto</Label>
              <Textarea
                id="a-impact"
                value={impact}
                onChange={(e) => setImpact(e.target.value)}
                rows={3}
                placeholder="Impacto esperado/obtenido (para Memoria de Labores)…"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="a-type">Tipo</Label>
              <Input
                id="a-type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                placeholder="Ej. Clases, Capacitación, Evento"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="a-location">Ubicación</Label>
              <Input
                id="a-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="a-start">Fecha inicio</Label>
              <Input
                id="a-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="a-end">Fecha fin</Label>
              <Input
                id="a-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-2">
              <Label htmlFor="a-hours">Horas</Label>
              <Input
                id="a-hours"
                type="number"
                min="0"
                step="0.5"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="a-hourType">Tipo de horas</Label>
              <Select value={hourType} onValueChange={(v) => setHourType(v as HourType)}>
                <SelectTrigger id="a-hourType" className="w-full">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="field">De campo</SelectItem>
                  <SelectItem value="admin">Administrativas</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Se asignan al finalizar
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="a-men">Benef. Hombres</Label>
              <Input
                id="a-men"
                type="number"
                min="0"
                value={benMen}
                onChange={(e) => setBenMen(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="a-women">Benef. Mujeres</Label>
              <Input
                id="a-women"
                type="number"
                min="0"
                value={benWomen}
                onChange={(e) => setBenWomen(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="a-committee">Comité</Label>
            <Select value={committeeId} onValueChange={setCommitteeId}>
              <SelectTrigger id="a-committee" className="w-full">
                <SelectValue placeholder="Sin comité" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin comité</SelectItem>
                {committees.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Capacidad */}
          <div className="space-y-2">
            <Label htmlFor="a-capacity">Cupo máximo de participantes</Label>
            <Input
              id="a-capacity"
              type="number"
              min="1"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder="Ej. 20"
            />
            <p className="text-xs text-muted-foreground">
              Deja vacío para cupo ilimitado
            </p>
          </div>

          {/* ODS multi-select */}
          <div className="space-y-2">
            <Label>ODS relacionados</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto scroll-thin border rounded-md p-2">
              {ODS_OPTIONS.map((o) => (
                <label
                  key={o}
                  className="flex items-center gap-2 text-xs cursor-pointer hover:bg-accent rounded px-1.5 py-1"
                >
                  <Checkbox
                    checked={ods.includes(o)}
                    onCheckedChange={() => toggleOds(o)}
                  />
                  <span className="truncate">{o}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Volunteers multi-select */}
          <div className="space-y-2">
            <Label>Voluntarios asignados ({volunteerIds.length})</Label>
            <Input
              placeholder="Buscar voluntario..."
              value={volSearch}
              onChange={(e) => setVolSearch(e.target.value)}
              className="h-9"
            />
            <div className="max-h-48 overflow-y-auto scroll-thin border rounded-md p-1.5 space-y-0.5">
              {filteredVols.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Sin coincidencias
                </p>
              ) : (
                filteredVols.map((v) => (
                  <label
                    key={v.id}
                    className="flex items-center gap-2 text-sm cursor-pointer hover:bg-accent rounded px-1.5 py-1.5 min-h-[36px]"
                  >
                    <Checkbox
                      checked={volunteerIds.includes(v.id)}
                      onCheckedChange={() => toggleVolunteer(v.id)}
                    />
                    <span className="size-6 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-semibold shrink-0">
                      {v.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="truncate flex-1">{v.name}</span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {v.studentId}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              disabled={submitting}
            >
              {submitting && <Loader2 className="size-4 animate-spin" />}
              {editing ? "Guardar cambios" : "Crear actividad"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
