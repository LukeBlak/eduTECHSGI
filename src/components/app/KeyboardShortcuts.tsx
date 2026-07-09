"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Keyboard, Command } from "lucide-react";
import { type SectionId, NAV_ITEMS } from "./nav";

/**
 * Map of "g + <key>" sequences to section ids. We pick keys that are
 * mnemonic in Spanish and don't collide. Help dialog lists them all.
 */
const GOTO_KEYS: Record<string, SectionId> = {
  d: "dashboard",
  v: "voluntarios",
  c: "comites",
  a: "actividades",
  h: "horas",
  l: "clases",
  e: "calendario",
  r: "ranking",
  i: "ingresos",
  g: "egresos", // g = "gastos"
  o: "reportes", // o = "reportes" (r was taken by ranking)
  p: "perfil",
};

interface ShortcutDef {
  keys: string;
  description: string;
  group: "Navegación" | "Búsqueda" | "General";
}

const SHORTCUTS: ShortcutDef[] = [
  { keys: "?", description: "Mostrar esta ayuda", group: "General" },
  { keys: "Esc", description: "Cerrar diálogos o ayuda", group: "General" },
  { keys: "⌘/Ctrl + K", description: "Abrir búsqueda global", group: "Búsqueda" },
  { keys: "/", description: "Enfocar búsqueda dentro de la sección", group: "Búsqueda" },
  ...NAV_ITEMS.map((n) => ({
    keys: `g then ${Object.entries(GOTO_KEYS).find(([, id]) => id === n.id)?.[0] ?? ""}`,
    description: `Ir a ${n.label}`,
    group: "Navegación" as const,
  })),
];

/**
 * Hook that listens for global keyboard shortcuts.
 *
 * - `?` toggles the help dialog
 * - `g <key>` navigates to a section (see GOTO_KEYS)
 * - `/` focuses the first searchable input in the active section
 *
 * All shortcuts are ignored when the user is typing in an input/textarea/select
 * or when a dialog is open (Escape still works to close dialogs).
 */
export function useKeyboardShortcuts(
  onNavigate: (id: SectionId) => void,
  onToggleHelp: () => void,
) {
  const gPressedAt = useRef<number>(0);
  const G_WINDOW_MS = 700;

  const isTyping = useCallback((el: EventTarget | null) => {
    if (!(el instanceof HTMLElement)) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    if (el.isContentEditable) return true;
    return false;
  }, []);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Cmd/Ctrl + K is handled by GlobalSearch — skip
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") return;

      // ? opens help (Shift+/)
      if (e.key === "?" && !isTyping(e.target)) {
        e.preventDefault();
        onToggleHelp();
        return;
      }

      // Escape always propagates naturally (closes dialogs via Radix)
      if (e.key === "Escape") return;

      // Don't trigger shortcuts while typing
      if (isTyping(e.target)) return;

      // `/` focuses first search input in the section
      if (e.key === "/") {
        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>(
          'input[aria-label*="Buscar" i], input[placeholder*="Buscar" i], input[placeholder*="buscar" i]',
        );
        if (input) {
          input.focus();
          input.select?.();
        }
        return;
      }

      // `g <key>` sequence navigation
      const key = e.key.toLowerCase();
      if (key === "g") {
        gPressedAt.current = Date.now();
        return;
      }
      if (gPressedAt.current && Date.now() - gPressedAt.current < G_WINDOW_MS) {
        const target = GOTO_KEYS[key];
        if (target) {
          e.preventDefault();
          gPressedAt.current = 0;
          onNavigate(target);
          return;
        }
        // not a valid sequence key — reset
        gPressedAt.current = 0;
      }
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isTyping, onNavigate, onToggleHelp]);
}

/**
 * Help dialog listing all keyboard shortcuts, grouped by category.
 * Triggered by pressing `?`.
 */
export function ShortcutsHelpDialog({
  open,
  onOpenChange,
  onNavigate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onNavigate: (id: SectionId) => void;
}) {
  const groups: ShortcutDef["group"][] = ["Navegación", "Búsqueda", "General"];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="size-5 text-primary" />
            Atajos de teclado
          </DialogTitle>
          <DialogDescription>
            Usa estos atajos para navegar más rápido por el sistema.
          </DialogDescription>
        </DialogHeader>
          <div className="space-y-5 mt-2">
          {groups.map((g) => (
            <div key={g}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {g}
              </p>
              <ul className="space-y-1.5">
                {SHORTCUTS.filter((s) => s.group === g).map((s, idx) => (
                  <li
                    key={`${s.keys}-${idx}`}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="text-muted-foreground">{s.description}</span>
                    <kbd className="inline-flex items-center gap-1 font-mono text-[11px] px-2 py-1 rounded-md border bg-muted/60 tabular-nums whitespace-nowrap shadow-[inset_0_-1px_0_0_hsl(var(--border))]">
                      {s.keys}
                    </kbd>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="rounded-lg border border-primary/20 bg-accent/40 p-3 text-xs text-accent-foreground flex items-start gap-2">
            <Command className="size-4 shrink-0 mt-0.5" />
            <p>
              Presiona <kbd className="font-mono px-1 py-0.5 rounded border bg-background shadow-[inset_0_-1px_0_0_hsl(var(--border))]">?</kbd> desde cualquier sección para abrir esta ayuda. Los atajos se desactivan mientras escribes en campos de formulario.
            </p>
          </div>
          <p className="text-[10px] text-center text-muted-foreground">
            Consejo: presiona <kbd className="font-mono px-1 py-0.5 rounded border bg-muted shadow-[inset_0_-1px_0_0_hsl(var(--border))]">g</kbd> y luego otra tecla para saltar a una sección.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Convenience wrapper bundling the hook + dialog state for use in AppShell.
 */
export function useShortcutsWithHelp(onNavigate: (id: SectionId) => void) {
  const [helpOpen, setHelpOpen] = useState(false);
  const navigate = useCallback(
    (id: SectionId) => {
      onNavigate(id);
    },
    [onNavigate],
  );
  const toggleHelp = useCallback(() => setHelpOpen((v) => !v), []);
  useKeyboardShortcuts(navigate, toggleHelp);
  return {
    helpOpen,
    setHelpOpen,
    toggleHelp,
    helpDialog: (
      <ShortcutsHelpDialog
        open={helpOpen}
        onOpenChange={setHelpOpen}
        onNavigate={(id) => {
          setHelpOpen(false);
          onNavigate(id);
        }}
      />
    ),
  };
}
