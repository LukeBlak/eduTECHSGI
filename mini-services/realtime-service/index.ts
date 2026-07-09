/**
 * EduTECH ESEN — Realtime Service (WebSocket).
 *
 * Arquitectura:
 *  - Puerto 3003: socket.io para clientes (navegadores). Path "/" (requerido por
 *    el gateway Caddy). El frontend conecta con `io("/?XTransformPort=3003")`.
 *  - Puerto 3004: HTTP interno. El backend Next.js publica eventos con
 *    `POST http://localhost:3004/__publish`. Se valida con token compartido.
 *    Separar puertos evita que socket.io (path "/") intercepte el endpoint interno.
 *
 * Eventos soportados (todos se reenvían tal cual a los clientes conectados):
 *  - activity:created | activity:updated | activity:deleted
 *  - social-hour:created | social-hour:approved | social-hour:rejected
 *  - income:created | income:updated | income:deleted
 *  - expense:created | expense:updated | expense:deleted
 *  - volunteer:created | volunteer:updated | volunteer:deleted
 *  - notification:created   (payload: { userId?: string; ... })
 *  - dashboard:refresh      (refresco global del dashboard)
 *
 * El servicio NO conoce la lógica de negocio: solo transporta eventos.
 */
import { createServer, type IncomingMessage } from "http";
import { Server, type Socket } from "socket.io";

const WS_PORT = 3003;
const INTERNAL_PORT = 3004;
const INTERNAL_TOKEN =
  process.env.REALTIME_INTERNAL_TOKEN || "edutech-realtime-internal-token";

interface PublishBody {
  event: string;
  payload?: Record<string, unknown>;
  /** Si se especifica `userId`, el evento solo se envía a ese usuario (room). */
  userId?: string;
}

/* ----------------------------- WebSocket (3003) ----------------------------- */

const io = new Server(WS_PORT, {
  // Path "/" es obligatorio: Caddy lo usa para enrutar al puerto correcto.
  path: "/",
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60_000,
  pingInterval: 25_000,
});

// Cada cliente se une a un room personal `user:<id>` si envía su userId
// (tras login). Así podemos enviar notificaciones dirigidas.
io.on("connection", (socket: Socket) => {
  socket.on("identify", (data: { userId?: string }) => {
    if (data?.userId) {
      // Salir de rooms user:* previos (por si re-identifica).
      for (const room of socket.rooms) {
        if (room.startsWith("user:")) socket.leave(room);
      }
      socket.join(`user:${data.userId}`);
    }
  });

  socket.on("ping-server", () => {
    socket.emit("pong-server", { t: Date.now() });
  });
});

console.log(`[realtime] WebSocket service listening on :${WS_PORT}`);

/* --------------------------- Internal HTTP (3004) --------------------------- */

const internalServer = createServer(async (req: IncomingMessage, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/__health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        wsClients: io.engine.clientsCount,
        wsPort: WS_PORT,
        internalPort: INTERNAL_PORT,
      }),
    );
    return;
  }

  if (req.method === "POST" && req.url === "/__publish") {
    const auth = req.headers["authorization"] || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (token !== INTERNAL_TOKEN) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }

    let raw = "";
    for await (const chunk of req) raw += chunk;
    let body: PublishBody;
    try {
      body = JSON.parse(raw || "{}") as PublishBody;
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid json" }));
      return;
    }
    if (!body.event) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "missing event" }));
      return;
    }

    if (body.userId) {
      io.to(`user:${body.userId}`).emit(body.event, body.payload ?? {});
    } else {
      io.emit(body.event, body.payload ?? {});
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, event: body.event, clients: io.engine.clientsCount }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

internalServer.listen(INTERNAL_PORT, () => {
  console.log(`[realtime] Internal publish endpoint: http://localhost:${INTERNAL_PORT}/__publish`);
});

/* ------------------------------ Graceful shutdown ------------------------------ */

const shutdown = (sig: string) => {
  console.log(`[realtime] ${sig} received, shutting down...`);
  io.close();
  internalServer.close(() => process.exit(0));
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
