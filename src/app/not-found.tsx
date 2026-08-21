import Link from "next/link";
import { BrandLogo } from "@/components/app/BrandLogo";
import { Button } from "@/components/ui/button";
import { Home, Compass, ArrowLeft } from "lucide-react";

/**
 * Página 404 — se renderiza cuando una ruta no existe.
 * Sigue la estética de marca (gradiente turquesa + logo) y es totalmente
 * responsive. Es un Server Component (sin "use client") para que Next.js
 * la sirva estáticamente sin hidratación innecesaria.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-brand-gradient-soft p-6 overflow-hidden relative">
      {/* Decorative blurred circles — sutiles, no estorban al contenido */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -left-24 size-72 rounded-full bg-brand-secondary/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -right-24 size-80 rounded-full bg-brand-primary/20 blur-3xl"
      />

      <main className="relative z-10 w-full max-w-md text-center flex flex-col items-center">
        {/* Logo */}
        <Link
          href="/"
          className="inline-flex transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-full"
          aria-label="Volver al inicio de EduTECH ESEN"
        >
          <BrandLogo size={88} className="shadow-lg shadow-primary/10" />
        </Link>

        {/* 404 gigante con color de marca */}
        <div className="mt-8 relative">
          <h1
            className="text-[7rem] sm:text-[9rem] font-black leading-none tracking-tighter text-brand-primary select-none drop-shadow-sm"
            aria-hidden="true"
          >
            404
          </h1>
        </div>

        {/* Icono de brújula perdido */}
        <div className="mt-6 inline-flex items-center justify-center size-14 rounded-full bg-primary/10 text-primary">
          <Compass className="size-7" />
        </div>

        {/* Mensaje */}
        <h2 className="mt-6 text-2xl font-bold text-foreground">
          Página no encontrada
        </h2>
        <p className="mt-2 text-sm text-muted-foreground max-w-sm">
          La página que buscas no existe, fue movida, o el enlace que seguiste
          está roto. Verifica la URL o vuelve al panel principal de EduTECH
          ESEN.
        </p>

        {/* Botones de acción */}
        <div className="mt-8 flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <Button asChild size="lg" className="bg-brand-gradient text-white">
            <Link href="/">
              <Home className="size-4" />
              Ir al inicio
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="border-primary/30 text-primary hover:bg-primary/5"
          >
            <Link href="/">
              <ArrowLeft className="size-4" />
              Volver atrás
            </Link>
          </Button>
        </div>

        {/* Footer info */}
        <p className="mt-10 text-xs text-muted-foreground/70">
          EduTECH ESEN · Gestión de Voluntarios y Horas Sociales
        </p>
      </main>
    </div>
  );
}
