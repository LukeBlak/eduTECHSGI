"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/app/BrandLogo";
import { Button } from "@/components/ui/button";
import {
  Home,
  RefreshCw,
  TriangleAlert,
  Bug,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

/**
 * Error boundary global — captura cualquier runtime error no manejado en
 * la app (rutas, hooks, componentes) y muestra una pantalla amigable en
 * vez del "Application error: a client-side exception has occurred" por
 * defecto de Next.js.
 *
 * Es un Client Component obligatorio (require "use client") porque usa
 * `error` y `reset` que vienen del router de App Router.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);

  // Loguea el error a la consola del navegador para debugging.
  useEffect(() => {
    console.error("[EduTECH ESEN] Error boundary capturó:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-brand-gradient-soft p-6 overflow-hidden relative">
      {/* Decorative blurred circles */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -left-24 size-72 rounded-full bg-red-400/15 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -right-24 size-80 rounded-full bg-amber-400/15 blur-3xl"
      />

      <main className="relative z-10 w-full max-w-lg text-center flex flex-col items-center">
        {/* Logo */}
        <Link
          href="/"
          className="inline-flex transition-transform hover:scale-105"
          aria-label="Volver al inicio de EduTECH ESEN"
        >
          <BrandLogo size={88} className="shadow-lg shadow-primary/10" />
        </Link>

        {/* Icono de alerta */}
        <div className="mt-8 inline-flex items-center justify-center size-16 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <TriangleAlert className="size-8" />
        </div>

        {/* Título */}
        <h1 className="mt-6 text-2xl sm:text-3xl font-bold text-foreground">
          Algo salió mal
        </h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-md">
          Ocurrió un error inesperado al cargar esta página. Puedes intentar
          recargar la página o volver al inicio. Si el problema persiste,
          contacta al administrador del sistema.
        </p>

        {/* Botones de acción */}
        <div className="mt-8 flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <Button
            size="lg"
            className="bg-brand-gradient text-white"
            onClick={() => reset()}
          >
            <RefreshCw className="size-4" />
            Intentar de nuevo
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/">
              <Home className="size-4" />
              Ir al inicio
            </Link>
          </Button>
        </div>

        {/* Detalles colapsables del error (para debugging) */}
        <div className="mt-8 w-full max-w-md">
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="w-full flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors py-2 px-4 rounded-md hover:bg-muted/50"
            aria-expanded={showDetails}
            aria-controls="error-details"
          >
            <Bug className="size-3.5" />
            {showDetails ? "Ocultar detalles técnicos" : "Ver detalles técnicos"}
            {showDetails ? (
              <ChevronUp className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
          </button>
          {showDetails && (
            <pre
              id="error-details"
              className="mt-2 max-h-48 overflow-y-auto rounded-md border border-border bg-muted/50 p-4 text-left text-[11px] leading-relaxed text-muted-foreground font-mono whitespace-pre-wrap break-words"
            >
              <span className="font-semibold text-foreground">Mensaje:</span>
              {"\n"}
              {error.message || "Sin mensaje"}
              {"\n\n"}
              <span className="font-semibold text-foreground">Digest:</span>
              {"\n"}
              {error.digest || "—"}
              {"\n\n"}
              <span className="font-semibold text-foreground">Stack:</span>
              {"\n"}
              {error.stack || "Sin stack trace"}
            </pre>
          )}
        </div>

        {/* Footer info */}
        <p className="mt-10 text-xs text-muted-foreground/70">
          EduTECH ESEN · Gestión de Voluntarios y Horas Sociales
        </p>
      </main>
    </div>
  );
}
