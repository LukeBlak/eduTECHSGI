"use client";

/**
 * RealtimeProvider — conexión WebSocket única compartida por toda la app.
 *
 * Se monta en AppShell (después del login). Conecta al URL indicado por
 * `process.env.NEXT_PUBLIC_REALTIME_URL` (mini-service socket.io desplegado
 * aparte, p.ej. Railway/Render/Fly.io).
 *
 * Si la variable NO está definida (caso por defecto en Vercel, donde no hay
 * WebSocket serverless), el provider se degrada limpiamente: NO crea socket,
 * NO imprime errores en consola, y simplemente renderiza los children sin
 * tiempo real. La app sigue siendo funcional con polling de 30s como fallback.
 *
 * Identifica al usuario para que el backend pueda enviarle notificaciones
 * dirigidas (room `user:<id>`).
 *
 * Expone un contexto con:
 *  - `connected`: boolean (estado de la conexión)
 *  - `subscribe(event, handler)`: registrar handler para un evento.
 *    Retorna función de desuscripción.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";
import { useAuthStore } from "@/lib/auth-store";

type EventHandler = (payload: unknown) => void;

interface RealtimeContextValue {
  connected: boolean;
  subscribe: (event: string, handler: EventHandler) => () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuthStore();
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  // Mapa de eventos → Set de handlers. Se mantiene en un ref para que los
  // handlers puedan registrarse/desregistrarse sin reiniciar el socket.
  const handlersRef = useRef<Map<string, Set<EventHandler>>>(new Map());

  // Conectar al montar / cuando cambia el usuario.
  useEffect(() => {
    // URL del mini-service realtime. Si no está configurada (Vercel por
    // defecto), el provider se degrada: no crea socket y solo renderiza
    // children sin tiempo real.
    const realtimeUrl = process.env.NEXT_PUBLIC_REALTIME_URL;
    if (!realtimeUrl) {
      // Log único (se ejecuta solo al montar). No spamea.
      console.info("Realtime desactivado (NEXT_PUBLIC_REALTIME_URL no configurado)");
      return;
    }

    const socket = io(realtimeUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 10000,
    });
    socketRef.current = socket;

    const onConnect = () => {
      setConnected(true);
      // Identificarse con el userId para recibir notificaciones dirigidas.
      if (user?.id) {
        socket.emit("identify", { userId: user.id });
      }
    };
    const onDisconnect = () => setConnected(false);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    // Listener genérico: despacha cada evento a sus handlers suscritos.
    const dispatch = (event: string) => (payload: unknown) => {
      const set = handlersRef.current.get(event);
      if (!set) return;
      set.forEach((h) => {
        try {
          h(payload);
        } catch (err) {
          console.warn(`[realtime] handler error for "${event}":`, err);
        }
      });
    };

    // Registrar listeners para los eventos canónicos.
    const events = [
      "activity:created",
      "activity:updated",
      "activity:deleted",
      "activity:subscribed",
      "activity:unsubscribed",
      "social-hour:created",
      "social-hour:approved",
      "social-hour:rejected",
      "income:created",
      "income:updated",
      "income:deleted",
      "expense:created",
      "expense:updated",
      "expense:deleted",
      "volunteer:created",
      "volunteer:updated",
      "volunteer:deleted",
      "notification:created",
      "dashboard:refresh",
    ];
    const dispatchers = events.map((e) => {
      const fn = dispatch(e);
      socket.on(e, fn);
      return { e, fn };
    });

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      dispatchers.forEach(({ e, fn }) => socket.off(e, fn));
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [user?.id]);

  // Re-identificarse si el usuario cambia después de la conexión inicial.
  useEffect(() => {
    if (user?.id && socketRef.current?.connected) {
      socketRef.current.emit("identify", { userId: user.id });
    }
  }, [user?.id]);

  const subscribe = useCallback((event: string, handler: EventHandler) => {
    let set = handlersRef.current.get(event);
    if (!set) {
      set = new Set();
      handlersRef.current.set(event, set);
    }
    set.add(handler);
    return () => {
      set?.delete(handler);
    };
  }, []);

  const value = useMemo(
    () => ({ connected, subscribe }),
    [connected, subscribe],
  );

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}

/** Hook para acceder al contexto realtime. */
export function useRealtimeContext(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) {
    // Devolver un no-op seguro si se usa fuera del provider (p.ej. en tests).
    return {
      connected: false,
      subscribe: () => () => {},
    };
  }
  return ctx;
}

/**
 * Hook: registra un handler para un evento realtime.
 *
 * @example
 *   useRealtimeEvent("activity:created", () => refetch());
 */
export function useRealtimeEvent(
  event: string,
  handler: EventHandler,
): void {
  const { subscribe } = useRealtimeContext();
  // Estabilizar el handler para no re-suscribir en cada render.
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    const unsub = subscribe(event, (p) => handlerRef.current(p));
    return unsub;
  }, [event, subscribe]);
}

/**
 * Hook de conveniencia: refresca la sección cuando llega cualquiera de los
 * eventos indicados. El refresco está debounced (default 300ms) para agrupar
 * ráfagas de eventos.
 *
 * @example
 *   useRealtimeRefresh(["activity:created", "activity:updated"], refetch);
 */
export function useRealtimeRefresh(
  events: string[],
  onRefresh: () => void,
  debounceMs = 300,
): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cbRef = useRef(onRefresh);
  useEffect(() => {
    cbRef.current = onRefresh;
  }, [onRefresh]);

  const { subscribe } = useRealtimeContext();
  // Clave estable para la lista de eventos (evita re-suscribir en cada render).
  const eventsKey = events.join(",");

  useEffect(() => {
    const evs = eventsKey.split(",");
    const unsubs = evs.map((ev) =>
      subscribe(ev, () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          try {
            cbRef.current();
          } catch (err) {
            console.warn("[realtime] refresh handler error:", err);
          }
        }, debounceMs);
      }),
    );
    return () => {
      unsubs.forEach((u) => u());
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [eventsKey, debounceMs, subscribe]);
}
