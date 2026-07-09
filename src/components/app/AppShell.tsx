"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useShortcutsWithHelp } from "./KeyboardShortcuts";
import { type SectionId } from "./nav";
import { DashboardSection } from "./sections/DashboardSection";
import { VoluntariosSection } from "./sections/VoluntariosSection";
import { ComitesSection } from "./sections/ComitesSection";
import { ActividadesSection } from "./sections/ActividadesSection";
import { HorasSocialesSection } from "./sections/HorasSocialesSection";
import { SolicitudesHorasSection } from "./sections/SolicitudesHorasSection";
import { ClasesSection } from "./sections/ClasesSection";
import { CalendarioSection } from "./sections/CalendarioSection";
import { RankingSection } from "./sections/RankingSection";
import { LogrosSection } from "./sections/LogrosSection";
import { ReportesSection } from "./sections/ReportesSection";
import { IngresosSection } from "./sections/IngresosSection";
import { EgresosSection } from "./sections/EgresosSection";
import { FirebaseSection } from "./sections/FirebaseSection";
import { NotificationsSection } from "./sections/NotificationsSection";
import { PerfilSection } from "./sections/PerfilSection";
import { RealtimeProvider } from "./realtime/RealtimeProvider";
import { RealtimeStatusDot } from "./realtime/RealtimeStatusDot";

interface AppShellProps {
  initialSection?: SectionId;
}

function renderSection(active: SectionId) {
  switch (active) {
    case "dashboard": return <DashboardSection />;
    case "voluntarios": return <VoluntariosSection />;
    case "comites": return <ComitesSection />;
    case "actividades": return <ActividadesSection />;
    case "horas": return <HorasSocialesSection />;
    case "solicitudes-horas": return <SolicitudesHorasSection />;
    case "clases": return <ClasesSection />;
    case "calendario": return <CalendarioSection />;
    case "ranking": return <RankingSection />;
    case "logros": return <LogrosSection />;
    case "reportes": return <ReportesSection />;
    case "ingresos": return <IngresosSection />;
    case "egresos": return <EgresosSection />;
    case "firebase": return <FirebaseSection />;
    case "notificaciones": return <NotificationsSection />;
    case "perfil": return <PerfilSection />;
    default: return <DashboardSection />;
  }
}

export function AppShell({ initialSection = "dashboard" }: AppShellProps) {
  const [active, setActive] = useState<SectionId>(initialSection);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const navigate = useCallback((id: SectionId) => {
    setActive(id);
    setMobileOpen(false);
  }, []);
  const { helpDialog, toggleHelp } = useShortcutsWithHelp(navigate);

  // Reset main scroll to top whenever the active section changes, so the
  // user always lands at the top of the new view instead of inheriting the
  // previous scroll position of the scroll container.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [active]);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <RealtimeProvider>
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Desktop sidebar — fixed height, never scrolls with the page */}
        <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-sidebar-border">
          <Sidebar active={active} onNavigate={setActive} />
        </aside>

        {/* Mobile drawer sidebar */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            side="left"
            className="w-72 p-0 [&>button]:hidden"
            aria-label="Navegación móvil"
          >
            <SheetTitle className="sr-only">Navegación</SheetTitle>
            <Sidebar
              active={active}
              onNavigate={setActive}
              onClose={() => setMobileOpen(false)}
            />
          </SheetContent>
        </Sheet>

        {/* Main column — topbar fixed, only <main> scrolls */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Topbar
            active={active}
            onOpenMobileNav={() => setMobileOpen(true)}
            onNavigate={setActive}
            onOpenShortcutsHelp={toggleHelp}
          />
          <main
            ref={mainRef}
            className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 max-w-full scroll-thin"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                {renderSection(active)}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>

      <footer className="shrink-0 border-t border-border/60 bg-background/70 backdrop-blur-md py-3 px-4 sm:px-6 text-center text-xs text-muted-foreground">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-3">
          <span>
            EduTECH ESEN · Gestión de Voluntarios y Horas Sociales © {new Date().getFullYear()}
          </span>
          <span className="hidden sm:inline text-border">·</span>
          <RealtimeStatusDot />
          <span className="hidden sm:inline text-border">·</span>
          <span className="hidden sm:inline-flex items-center gap-1">
            Presiona
            <kbd className="font-mono px-1 py-0.5 rounded border bg-muted/60 text-[10px] shadow-[inset_0_-1px_0_0_hsl(var(--border))]">?</kbd>
            para ver atajos
          </span>
        </div>
      </footer>

      {helpDialog}
      </RealtimeProvider>
    </div>
  );
}
