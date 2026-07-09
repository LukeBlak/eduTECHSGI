"use client";

/**
 * RealtimeStatusDot — indicador visual del estado de la conexión WebSocket.
 * Muestra un punto verde pulsante cuando está conectado, rojo atenuado cuando no.
 * Tooltip con texto explicativo.
 */
import { useRealtimeContext } from "./RealtimeProvider";
import { cn } from "@/lib/utils";

export function RealtimeStatusDot({ className }: { className?: string }) {
  const { connected } = useRealtimeContext();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[10px] font-medium select-none",
        className,
      )}
      title={
        connected
          ? "Conectado en tiempo real — los cambios se actualizan automáticamente"
          : "Reconectando… — los datos pueden no estar actualizados"
      }
      aria-label={connected ? "Tiempo real conectado" : "Tiempo real desconectado"}
    >
      <span className="relative flex size-2">
        {connected && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        )}
        <span
          className={cn(
            "relative inline-flex size-2 rounded-full",
            connected ? "bg-emerald-500" : "bg-muted-foreground/40",
          )}
        />
      </span>
      <span className="hidden sm:inline text-muted-foreground">
        {connected ? "En vivo" : "Sin conexión"}
      </span>
    </span>
  );
}
