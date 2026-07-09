"use client";

import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  accent?: "emerald" | "graphite" | "rose" | "sky" | "violet" | "teal";
  loading?: boolean;
}

const ACCENTS: Record<string, { ring: string; bg: string; text: string; gradient: string }> = {
  emerald: {
    ring: "ring-primary/20",
    bg: "bg-primary/10",
    text: "text-primary dark:text-primary",
    gradient: "from-primary/10 to-transparent",
  },
  teal: {
    ring: "ring-secondary/20",
    bg: "bg-secondary/15",
    text: "text-secondary-foreground dark:text-secondary",
    gradient: "from-secondary/10 to-transparent",
  },
  graphite: {
    ring: "ring-graphite-500/20",
    bg: "bg-graphite-500/10",
    text: "text-graphite-600 dark:text-graphite-400",
    gradient: "from-graphite-500/10 to-transparent",
  },
  rose: {
    ring: "ring-rose-500/20",
    bg: "bg-rose-500/10",
    text: "text-rose-600 dark:text-rose-400",
    gradient: "from-rose-500/10 to-transparent",
  },
  sky: {
    ring: "ring-sky-500/20",
    bg: "bg-sky-500/10",
    text: "text-sky-600 dark:text-sky-400",
    gradient: "from-sky-500/10 to-transparent",
  },
  violet: {
    ring: "ring-violet-500/20",
    bg: "bg-violet-500/10",
    text: "text-violet-600 dark:text-violet-400",
    gradient: "from-violet-500/10 to-transparent",
  },
};

export function StatCard({
  title,
  value,
  icon: Icon,
  description,
  accent = "emerald",
  loading,
}: StatCardProps) {
  const a = ACCENTS[accent] || ACCENTS.emerald;
  return (
    <Card className={cn("relative overflow-hidden ring-1 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5", a.ring)}>
      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-br pointer-events-none",
          a.gradient,
        )}
      />
      <CardContent className="relative p-5 flex items-start gap-4">
        <div className={cn("size-12 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105", a.bg, a.text)}>
          <Icon className="size-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-muted-foreground truncate">{title}</p>
          {loading ? (
            <Skeleton className="h-8 w-24 mt-1" />
          ) : (
            <p className="text-2xl font-bold tracking-tight truncate">{value}</p>
          )}
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{description}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
      <div className="min-w-0">
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="size-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
        <Icon className="size-7 text-muted-foreground" />
      </div>
      <h3 className="font-semibold text-base mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-sm mb-4">{description}</p>
      )}
      {action}
    </div>
  );
}

export function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

/**
 * KPI Card with trend indicator — used in dashboard for derived metrics
 * (averages, percentages, growth). Shows value + optional trend arrow +
 * optional progress bar + description.
 */
interface KpiCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  accent?: "emerald" | "graphite" | "rose" | "sky" | "violet" | "teal";
  trend?: {
    value: number;
    label?: string;
    invertColors?: boolean; // when true, negative = good (e.g. expenses)
  };
  progress?: {
    value: number; // 0..100
    label?: string;
  };
  loading?: boolean;
}

export function KpiCard({
  title,
  value,
  icon: Icon,
  description,
  accent = "emerald",
  trend,
  progress,
  loading,
}: KpiCardProps) {
  const a = ACCENTS[accent] || ACCENTS.emerald;
  const trendUp = trend ? trend.value >= 0 : false;
  const trendGood = trend ? (trend.invertColors ? !trendUp : trendUp) : false;
  return (
    <Card className={cn("relative overflow-hidden ring-1 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5", a.ring)}>
      <div className={cn("absolute inset-0 bg-gradient-to-br pointer-events-none", a.gradient)} />
      <CardContent className="relative p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className={cn("size-10 rounded-xl flex items-center justify-center shrink-0", a.bg, a.text)}>
            <Icon className="size-5" />
          </div>
          {trend && (
            <span
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums",
                trendGood
                  ? "bg-primary/15 text-primary"
                  : "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
              )}
              title={trend.label}
            >
              {trendUp ? "▲" : "▼"} {Math.abs(trend.value)}%
            </span>
          )}
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground truncate uppercase tracking-wide">{title}</p>
          {loading ? (
            <Skeleton className="h-7 w-20 mt-1" />
          ) : (
            <p className="text-2xl font-bold tracking-tight tabular-nums">{value}</p>
          )}
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{description}</p>
          )}
        </div>
        {progress && (
          <div className="space-y-1">
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", a.bg.replace("/10", "/60"))}
                style={{ width: `${Math.min(100, Math.max(0, progress.value))}%` }}
              />
            </div>
            {progress.label && (
              <p className="text-[10px] text-muted-foreground tabular-nums">{progress.label}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Highlight — wraps occurrences of `query` inside `text` with a styled <mark>.
 * Used by in-section search to visually highlight matches. Case-insensitive
 * and accent-insensitive (so "maria" highlights "María"), safe for arbitrary
 * user input (escapes regex metacharacters).
 */
export function Highlight({
  text,
  query,
  className,
}: {
  text: string;
  query: string;
  className?: string;
}): ReactNode {
  const value = text ?? "";
  const q = (query || "").trim();
  if (!q) return <>{value}</>;
  // Normalize: strip diacritics + lowercase for matching, but preserve
  // the original text for rendering so accents stay visible to the user.
  const norm = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const qn = norm(q);
  const valueNorm = norm(value);
  if (!qn) return <>{value}</>;
  // Find match indices in the normalized string, then slice the original.
  const indices: number[] = [];
  let from = 0;
  while (from <= valueNorm.length - qn.length) {
    const idx = valueNorm.indexOf(qn, from);
    if (idx === -1) break;
    indices.push(idx);
    from = idx + qn.length;
  }
  if (indices.length === 0) return <>{value}</>;
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const idx of indices) {
    if (idx > cursor) parts.push(<Fragment key={`t-${cursor}`}>{value.slice(cursor, idx)}</Fragment>);
    parts.push(
      <mark
        key={`m-${idx}`}
        className={cn(
          "bg-graphite-200/70 dark:bg-graphite-400/30 text-inherit rounded px-0.5",
          className,
        )}
      >
        {value.slice(idx, idx + qn.length)}
      </mark>,
    );
    cursor = idx + qn.length;
  }
  if (cursor < value.length) {
    parts.push(<Fragment key={`t-end`}>{value.slice(cursor)}</Fragment>);
  }
  return <>{parts}</>;
}

/**
 * FilterBadge — small pill showing active filter count, used by section filter bars.
 */
export function FilterBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/15 text-primary tabular-nums">
      {count} activo{count === 1 ? "" : "s"}
    </span>
  );
}
