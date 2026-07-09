"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/lib/auth-store";
import { LoginScreen } from "@/components/app/LoginScreen";
import { AppShell } from "@/components/app/AppShell";
import { Loader2 } from "lucide-react";
import { BrandLogo } from "@/components/app/BrandLogo";

export default function Home() {
  const { status, bootstrap, user } = useAuthStore();

  // On mount: bootstrap auth (verify token if any).
  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  // NOTA: El seed de inicialización NO se ejecuta automáticamente.
  // En producción, el operador debe llamar a `POST /api/seed` UNA SOLA VEZ
  // tras el despliegue (por ejemplo con curl) para crear el admin inicial.
  // Ejecutarlo en cada visita sería peligroso porque ahora el seed borra
  // toda la BD antes de crear el admin.

  if (status === "loading") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-brand-gradient-soft p-4">
        <div className="flex flex-col items-center gap-4">
          <BrandLogo size={72} className="shadow-lg shadow-primary/10" />
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span className="text-sm">Cargando EduTECH ESEN...</span>
          </div>
        </div>
      </div>
    );
  }

  if (status !== "authenticated" || !user) {
    return <LoginScreen />;
  }

  return <AppShell />;
}
