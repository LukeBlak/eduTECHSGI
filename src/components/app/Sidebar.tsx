"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { X, Trophy, TrendingUp } from "lucide-react";
import { NAV_ITEMS, NAV_GROUPS, visibleNavItems, type SectionId } from "./nav";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth-store";
import { volunteersApi, type VolunteerHours } from "@/lib/api";
import { BrandLogo } from "./BrandLogo";

interface SidebarProps {
  active: SectionId;
  onNavigate: (id: SectionId) => void;
  /** Mobile drawer close handler (only relevant inside Sheet). */
  onClose?: () => void;
}

const GOAL_HOURS = 100;

export function Sidebar({ active, onNavigate, onClose }: SidebarProps) {
  const { user } = useAuthStore();
  const isVolunteer = user?.role === "volunteer";
  const isPrivileged = !!user && ["admin", "committee_leader", "president", "vice_president"].includes(user.role);
  const visibleItems = visibleNavItems(user?.role);
  const [hours, setHours] = useState<VolunteerHours | null>(null);

  useEffect(() => {
    if (isVolunteer && user?.id) {
      let cancelled = false;
      volunteersApi
        .hours(user.id)
        .then((h) => !cancelled && setHours(h))
        .catch(() => !cancelled && setHours(null));
      return () => {
        cancelled = true;
      };
    }
    setHours(null);
  }, [isVolunteer, user?.id]);

  // Keep the active nav item scrolled into view inside the sidebar nav, so
  // that when the user navigates (e.g. to "Mi Perfil" at the bottom) the
  // sidebar auto-scrolls to reveal it instead of staying put.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const el = document.querySelector<HTMLElement>(
      `nav[aria-label="Navegación principal"] button[data-nav-item="${active}"]`,
    );
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active]);

  const totalHours = hours?.totalHours ?? 0;
  const progressPct = Math.min(100, (totalHours / GOAL_HOURS) * 100);
  const goalReached = totalHours >= GOAL_HOURS;

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-sidebar-border">
        <BrandLogo size={40} />
        <div className="min-w-0">
          <p className="font-bold leading-tight text-foreground truncate">
            EduTECH ESEN
          </p>
          <p className="text-xs text-muted-foreground truncate">
            Voluntariado · Horas Sociales
          </p>
        </div>
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto lg:hidden"
            onClick={onClose}
            aria-label="Cerrar menú"
          >
            <X className="size-4" />
          </Button>
        )}
      </div>

      {/* Volunteer progress widget */}
      {isVolunteer && (
        <div className="px-3 pt-3">
          <button
            type="button"
            onClick={() => {
              onNavigate("perfil");
              onClose?.();
            }}
            className={cn(
              "w-full rounded-xl border p-3 text-left transition-all hover:shadow-sm",
              "bg-brand-gradient-soft",
              "border-primary/20",
              active === "perfil" && "ring-1 ring-primary/40",
            )}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-primary flex items-center gap-1">
                <TrendingUp className="size-3" />
                Mi progreso
              </span>
              {goalReached && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-graphite-700 dark:text-graphite-400 bg-graphite-100 dark:bg-graphite-950/60 px-1.5 py-0.5 rounded">
                  <Trophy className="size-2.5" />
                  Meta
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-1 mb-1.5">
              <span className="text-2xl font-bold tabular-nums text-foreground">
                {totalHours}
              </span>
              <span className="text-xs text-muted-foreground">/ {GOAL_HOURS}h</span>
            </div>
            <div className="h-1.5 bg-background/60 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-gradient rounded-full transition-all duration-700"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 tabular-nums">
              {goalReached
                ? "¡Meta alcanzada! Gracias por tu compromiso."
                : `${GOAL_HOURS - totalHours}h para la meta`}
            </p>
          </button>
        </div>
      )}

      {/* Nav grouped */}
      <nav
        className="flex-1 overflow-y-auto scroll-thin px-3 py-3 space-y-2"
        aria-label="Navegación principal"
      >
        {NAV_GROUPS.map((group) => {
          const items = visibleItems.filter((i) => i.group === group.id);
          if (items.length === 0) return null;
          return (
            <div key={group.id} className="space-y-0.5">
              <p className="px-3 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {group.label}
              </p>
              {items.map((item) => {
                const isActive = item.id === active;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-nav-item={item.id}
                    onClick={() => {
                      onNavigate(item.id);
                      onClose?.();
                    }}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "group relative w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all min-h-[40px] text-left",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    )}
                  >
                    {isActive && (
                      <span
                        aria-hidden
                        className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-white/80"
                      />
                    )}
                    <Icon
                      className={cn(
                        "size-5 shrink-0 transition-transform group-hover:scale-110",
                        isActive ? "text-white" : "text-muted-foreground",
                      )}
                    />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Footer mini */}
      <div className="px-4 py-3 border-t border-sidebar-border space-y-2">
        <button
          type="button"
          onClick={() => {
            // Dispatch a synthetic Cmd+K to open global search
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
          }}
          className="w-full flex items-center justify-between gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-md px-2 py-1.5 hover:bg-sidebar-accent"
        >
          <span className="flex items-center gap-1.5">
            <kbd className="pointer-events-none select-none rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono">⌘K</kbd>
            <span>Buscar</span>
          </span>
        </button>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary animate-soft-pulse" aria-hidden />
          <span>Sistema activo · 2025</span>
        </div>
      </div>
    </div>
  );
}
