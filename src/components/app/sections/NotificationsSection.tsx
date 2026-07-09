"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  BellRing,
  CheckCheck,
  RefreshCw,
  Loader2,
  Clock,
  CalendarDays,
  Wallet,
  Receipt,
  Users,
  CheckCircle2,
  GraduationCap,
  ClipboardList,
  Info,
  type LucideIcon,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  notificationsApi,
  type NotificationItem,
  type NotificationType,
} from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { SectionHeader, EmptyState } from "../Shared";
import { cn } from "@/lib/utils";

/* ---------- constants & helpers ---------- */

const TYPE_META: Record<
  NotificationType,
  { icon: LucideIcon; label: string; tone: string }
> = {
  social_hour: {
    icon: Clock,
    label: "Horas sociales",
    tone: "bg-graphite-100 text-graphite-700 dark:bg-graphite-950/40 dark:text-graphite-300",
  },
  activity: {
    icon: CalendarDays,
    label: "Actividad",
    tone: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  },
  income: {
    icon: Wallet,
    label: "Ingreso",
    tone: "bg-primary/15 text-primary",
  },
  expense: {
    icon: Receipt,
    label: "Egreso",
    tone: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  },
  volunteer: {
    icon: Users,
    label: "Voluntario",
    tone: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  },
  system: {
    icon: Info,
    label: "Sistema",
    tone: "bg-muted text-muted-foreground",
  },
  hour_request: {
    icon: ClipboardList,
    label: "Solicitud de horas",
    tone: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  },
  class: {
    icon: GraduationCap,
    label: "Clase",
    tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
};

const EVENT_TYPES: {
  icon: LucideIcon;
  label: string;
  description: string;
  color: string;
}[] = [
  {
    icon: Clock,
    label: "Horas sociales",
    description: "Cuando se registran horas a un voluntario (al voluntario + admins)",
    color: "text-graphite-600",
  },
  {
    icon: CalendarDays,
    label: "Actividades",
    description: "Al crear una actividad (voluntarios asignados + comité + admins)",
    color: "text-sky-600",
  },
  {
    icon: Wallet,
    label: "Ingresos",
    description: "Al registrar un ingreso (admins)",
    color: "text-primary",
  },
  {
    icon: Receipt,
    label: "Egresos",
    description: "Al registrar un egreso (admins)",
    color: "text-rose-600",
  },
  {
    icon: Users,
    label: "Voluntarios",
    description: "Al registrar/auto-registrar un voluntario (admins)",
    color: "text-violet-600",
  },
  {
    icon: GraduationCap,
    label: "Clases",
    description: "Al crear una clase (instructores + comité + admins)",
    color: "text-emerald-600",
  },
  {
    icon: ClipboardList,
    label: "Solicitud de horas",
    description: "Cuando un voluntario pide horas extra y cuando se aprueba/rechaza",
    color: "text-amber-600",
  },
];

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return "Hace un momento";
    if (min < 60) return `Hace ${min} min`;
    const hours = Math.floor(min / 60);
    if (hours < 24) return `Hace ${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `Hace ${days}d`;
    return d.toLocaleDateString("es-SV", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/* ---------- component ---------- */

export function NotificationsSection() {
  const { user } = useAuthStore();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const load = useCallback(async () => {
    try {
      const res = await notificationsApi.list(filter === "unread");
      setItems(res.items);
      setUnreadCount(res.unreadCount);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al cargar notificaciones");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  async function handleMarkRead(id: string) {
    try {
      await notificationsApi.markRead(id);
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al marcar");
    }
  }

  async function handleMarkAllRead() {
    setMarkingAll(true);
    try {
      const res = await notificationsApi.markAllRead();
      toast.success(`${res.marked} notificación(es) marcada(s) como leída(s)`);
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al marcar todas");
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-5"
    >
      <SectionHeader
        title="Notificaciones"
        description="Centro de avisos internos del sistema"
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => {
                setRefreshing(true);
                load();
              }}
              disabled={refreshing}
            >
              {refreshing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              <span className="hidden sm:inline">Actualizar</span>
            </Button>
            {unreadCount > 0 && (
              <Button
                size="sm"
                className="h-9 bg-primary hover:bg-primary/90 text-primary-foreground"
                onClick={handleMarkAllRead}
                disabled={markingAll}
              >
                {markingAll ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CheckCheck className="size-4" />
                )}
                Marcar todas ({unreadCount})
              </Button>
            )}
          </div>
        }
      />

      {/* Resumen del sistema */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{items.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Notificaciones en tu bandeja
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Sin leer</CardDescription>
            <CardTitle className="text-2xl tabular-nums text-primary">
              {unreadCount}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Pendientes de revisión
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Destinatario</CardDescription>
            <CardTitle className="text-base truncate">
              {user?.name ?? "—"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {user?.role ? (
                <Badge variant="outline" className="text-[10px]">
                  {user.role}
                </Badge>
              ) : null}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filtro */}
      <div className="flex items-center gap-2">
        <Button
          variant={filter === "all" ? "default" : "outline"}
          size="sm"
          className="h-9"
          onClick={() => setFilter("all")}
        >
          Todas
        </Button>
        <Button
          variant={filter === "unread" ? "default" : "outline"}
          size="sm"
          className="h-9"
          onClick={() => setFilter("unread")}
        >
          Sin leer
          {unreadCount > 0 && (
            <Badge
              variant="secondary"
              className="ml-2 bg-primary/15 text-primary text-[10px]"
            >
              {unreadCount}
            </Badge>
          )}
        </Button>
      </div>

      {/* Lista de notificaciones */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 flex gap-3">
                <Skeleton className="size-9 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-0">
            <EmptyState
              icon={BellRing}
              title={
                filter === "unread"
                  ? "Sin notificaciones sin leer"
                  : "Sin notificaciones"
              }
              description={
                filter === "unread"
                  ? "Has revisado todas tus notificaciones. Vuelve más tarde para ver novedades."
                  : "Aún no tienes notificaciones. Cuando ocurran eventos importantes del sistema aparecerán aquí."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const meta = TYPE_META[n.type] ?? TYPE_META.system;
            const Icon = meta.icon;
            return (
              <motion.div
                key={n.id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
              >
                <Card
                  className={cn(
                    "transition-all hover:shadow-sm",
                    !n.read && "ring-1 ring-primary/30 bg-primary/[0.02]",
                  )}
                >
                  <CardContent className="p-4 flex gap-3">
                    <div
                      className={cn(
                        "size-9 rounded-full flex items-center justify-center shrink-0",
                        meta.tone,
                      )}
                    >
                      <Icon className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p
                              className={cn(
                                "text-sm font-medium leading-snug",
                                !n.read && "text-foreground",
                                n.read && "text-muted-foreground",
                              )}
                            >
                              {n.title}
                            </p>
                            {!n.read && (
                              <span
                                className="size-2 rounded-full bg-primary shrink-0"
                                aria-label="Sin leer"
                              />
                            )}
                          </div>
                          {n.message && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {n.message}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <Badge
                              variant="outline"
                              className={cn("text-[10px]", meta.tone)}
                            >
                              {meta.label}
                            </Badge>
                            <span className="text-[11px] text-muted-foreground">
                              {formatRelative(n.createdAt)}
                            </span>
                          </div>
                        </div>
                        {!n.read && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 shrink-0 text-xs"
                            onClick={() => handleMarkRead(n.id)}
                          >
                            <CheckCircle2 className="size-3.5" />
                            <span className="hidden sm:inline">Marcar leída</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Eventos que generan notificaciones */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BellRing className="size-4 text-primary" />
            Eventos que generan notificaciones
          </CardTitle>
          <CardDescription>
            El sistema crea avisos automáticos en los siguientes casos. Las
            notificaciones son visibles únicamente dentro del panel (no se
            envían por correo electrónico).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {EVENT_TYPES.map((ev) => {
            const Icon = ev.icon;
            return (
              <div
                key={ev.label}
                className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3"
              >
                <Icon className={cn("size-5 shrink-0 mt-0.5", ev.color)} />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{ev.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {ev.description}
                  </p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </motion.div>
  );
}
