"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bell,
  Clock,
  Wallet,
  Receipt,
  CalendarDays,
  Users,
  Mail,
  CheckCheck,
  BellRing,
  type LucideIcon,
} from "lucide-react";
import {
  notificationsApi,
  type NotificationItem,
  type NotificationType,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { useRealtimeEvent } from "./realtime/RealtimeProvider";

/* ---------- helpers ---------- */

function timeAgo(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 0) return "ahora";
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `hace ${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "ayer";
  if (diffD < 7) return `hace ${diffD} días`;
  return d.toLocaleDateString("es-SV", { day: "numeric", month: "short" });
}

const TYPE_META: Record<
  NotificationType,
  { icon: LucideIcon; color: string }
> = {
  social_hour: { icon: Clock, color: "text-graphite-600" },
  activity: { icon: CalendarDays, color: "text-sky-600" },
  income: { icon: Wallet, color: "text-primary" },
  expense: { icon: Receipt, color: "text-rose-600" },
  volunteer: { icon: Users, color: "text-violet-600" },
  system: { icon: Bell, color: "text-muted-foreground" },
};

/* ---------- component ---------- */

export function NotificationsBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  // Initial load: get all notifications (read + unread)
  const loadAll = useCallback(async () => {
    try {
      const res = await notificationsApi.list(false);
      setItems(res.items);
      setUnreadCount(res.unreadCount ?? 0);
    } catch {
      // Silent: leave empty state, don't toast spam
      setItems([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Polling: every 30s, re-fetch only the unread count to update the badge
  // without disrupting an open dropdown. Pause when tab is hidden.
  // (Fallback por si el WebSocket cae.)
  useEffect(() => {
    const POLL_MS = 30_000;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await notificationsApi.list(true);
        if (cancelled) return;
        // Only update the badge count — never touch the visible list, so an
        // open dropdown isn't visually disrupted mid-read. The full list is
        // refreshed lazily when the dropdown is (re)opened.
        setUnreadCount(res.unreadCount ?? 0);
      } catch {
        // silent
      }
    };

    const id = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // ─── Realtime: recibir nuevas notificaciones por push (sin esperar al polling) ───
  // El backend emite `notification:created` dirigido al usuario cuando se crea
  // una notificación para él. Aquí la añadimos a la lista y subimos el contador.
  useRealtimeEvent("notification:created", (payload) => {
    const p = payload as Partial<NotificationItem> | undefined;
    if (!p) {
      // Sin payload: refrescar contador.
      void notificationsApi.list(true).then((res) => setUnreadCount(res.unreadCount ?? 0)).catch(() => {});
      return;
    }
    const newItem: NotificationItem = {
      id: p.id ?? `rt-${Date.now()}`,
      type: (p.type ?? "system") as NotificationType,
      title: p.title ?? "Nueva notificación",
      message: p.message ?? "",
      link: p.link ?? "",
      read: false,
      createdAt: p.createdAt ?? new Date().toISOString(),
    };
    setItems((prev) => [newItem, ...prev].slice(0, 50));
    setUnreadCount((c) => c + 1);
  });

  // When the dropdown opens, refresh items in case there's something new
  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next && !loading) {
        loadAll();
      }
    },
    [loading, loadAll],
  );

  // Mark a single notification as read on click
  const handleItemClick = useCallback(
    async (item: NotificationItem) => {
      if (item.read) return;
      // Optimistic update
      setItems((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      try {
        await notificationsApi.markRead(item.id);
      } catch {
        // Revert on failure
        setItems((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, read: false } : n)),
        );
        setUnreadCount((c) => c + 1);
      }
    },
    [],
  );

  // Mark all as read
  const [markingAll, setMarkingAll] = useState(false);
  const handleMarkAll = useCallback(async () => {
    if (unreadCount === 0 || markingAll) return;
    setMarkingAll(true);
    // Optimistic
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    const prevCount = unreadCount;
    setUnreadCount(0);
    try {
      await notificationsApi.markAllRead();
    } catch {
      // Revert
      setItems((prev) =>
        prev.map((n) => {
          // Best-effort revert: we don't know which were unread, so reload
          return n;
        }),
      );
      setUnreadCount(prevCount);
      loadAll();
    } finally {
      setMarkingAll(false);
    }
  }, [unreadCount, markingAll, loadAll]);

  const badgeLabel = unreadCount > 9 ? "9+" : String(unreadCount);

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-11 w-11"
          aria-label="Notificaciones"
        >
          <BellRing className="size-5" />
          <AnimatePresence>
            {unreadCount > 0 && (
              <motion.span
                key={badgeLabel}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 25 }}
                aria-label={`${unreadCount} no leídas`}
                className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center ring-2 ring-background tabular-nums"
              >
                {badgeLabel}
              </motion.span>
            )}
          </AnimatePresence>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-80 sm:w-96 p-0"
      >
        {/* Header */}
        <DropdownMenuLabel className="flex items-center justify-between px-3 py-2.5">
          <span className="text-sm font-semibold">Notificaciones</span>
          <div className="flex items-center gap-1.5">
            {unreadCount > 0 && (
              <Badge
                variant="secondary"
                className="text-[10px] bg-primary/15 text-primary"
              >
                {unreadCount} sin leer
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAll}
              disabled={markingAll || unreadCount === 0}
              className="h-7 px-2 text-[11px] text-muted-foreground hover:text-primary"
              aria-label="Marcar todas como leídas"
            >
              <CheckCheck className="size-3.5" />
              <span className="hidden sm:inline">Marcar todas</span>
            </Button>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="my-0" />

        {/* Body — list */}
        <div className="max-h-96 overflow-y-auto scroll-thin">
          {loading ? (
            <div className="p-3 space-y-2.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 py-1.5"
                >
                  <Skeleton className="size-8 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-2.5 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="py-10 px-4 text-center">
              <div className="size-12 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto mb-3">
                <Bell className="size-6 text-muted-foreground/60" />
              </div>
              <p className="text-sm font-medium text-foreground/80">
                Sin notificaciones
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Estás al día con el sistema
              </p>
            </div>
          ) : (
            items.map((n) => {
              const meta = TYPE_META[n.type] || TYPE_META.system;
              const Icon = meta.icon;
              return (
                <DropdownMenuItem
                  key={n.id}
                  onSelect={(e) => {
                    // Prevent default closing behavior so we can manage state,
                    // but still mark as read.
                    e.preventDefault();
                    handleItemClick(n);
                  }}
                  className={cn(
                    "flex items-start gap-3 px-3 py-2.5 cursor-pointer rounded-none border-l-2",
                    n.read
                      ? "border-transparent"
                      : "border-primary bg-primary/5",
                    "hover:bg-accent/50 focus:bg-accent/50",
                  )}
                >
                  {/* Icon container */}
                  <div className="shrink-0 size-8 rounded-lg bg-muted/50 flex items-center justify-center">
                    <Icon className={cn("size-4", meta.color)} />
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Title row */}
                    <div className="flex items-center gap-1.5">
                      {!n.read && (
                        <span
                          aria-hidden
                          className="size-2 rounded-full bg-primary shrink-0"
                        />
                      )}
                      <p
                        className={cn(
                          "text-sm truncate min-w-0 flex-1",
                          n.read ? "font-medium" : "font-semibold",
                        )}
                      >
                        {n.title}
                      </p>
                    </div>
                    {/* Message */}
                    {n.message && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                        {n.message}
                      </p>
                    )}
                    {/* Footer: time + emailed flag */}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {timeAgo(n.createdAt)}
                      </span>
                      {n.emailed && (
                        <Mail
                          className="size-3 text-muted-foreground/70"
                          aria-label="Enviado por email"
                          title="Enviado por email"
                        />
                      )}
                    </div>
                  </div>
                </DropdownMenuItem>
              );
            })
          )}
        </div>

        <DropdownMenuSeparator className="my-0" />
        {/* Footer */}
        <div className="px-3 py-2">
          <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
            Las notificaciones también se envían por email cuando está
            configurado
          </p>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
