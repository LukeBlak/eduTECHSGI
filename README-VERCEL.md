# 🚀 Despliegue en Vercel — EduTECH ESEN

Guía paso a paso para desplegar este proyecto en Vercel con Firebase Firestore como base de datos.

## ⚠️ Requisitos previos

El proyecto usa **Firebase Firestore** como base de datos (NoSQL). Necesitas:

1. Una cuenta de Google
2. Un proyecto en Firebase Console (gratis)

## 🔥 Paso 1 — Crear el proyecto en Firebase

1. Entra a https://console.firebase.google.com/
2. Click **"Añadir proyecto"** (o usa uno existente)
3. Nombra el proyecto (ej. `edutech-esen`) → desactiva Google Analytics (no lo necesitas) → Crear proyecto
4. Una vez creado, entra al proyecto → en el menú izquierdo ve a **Firestore Database** → **Crear base de datos** → empieza en **modo de prueba** (o producción y configura reglas después) → región `us-central1` (recomendada para Vercel)

## 🔑 Paso 2 — Generar la Service Account Key

Necesitas 3 valores para que Vercel pueda conectarse a tu Firestore:

1. En Firebase Console → **⚙️ Project Settings** (junto a "Project Overview" arriba a la izquierda)
2. Ve a la pestaña **Service Accounts**
3. Click **"Generate new private key"** → confirma → se descarga un archivo JSON
4. Abre ese JSON y copia estos 3 valores:

| Campo del JSON | Variable de entorno |
|---|---|
| `project_id` | `FIREBASE_PROJECT_ID` |
| `client_email` | `FIREBASE_CLIENT_EMAIL` |
| `private_key` | `FIREBASE_PRIVATE_KEY` (cópiala COMPLETA, incluyendo `-----BEGIN PRIVATE KEY-----` y `-----END PRIVATE KEY-----`, con los `\n` literales) |

⚠️ **Guarda este JSON en un lugar seguro.** Es tu credencial de acceso administrativo a la BD. NO lo subas a GitHub.

## 🌐 Paso 3 — Importar en Vercel

1. Entra a https://vercel.com → **Add New → Project**
2. Importa tu repo de GitHub (`LukeBlak/eduTECHSGI`)
3. Vercel auto-detecta Next.js — NO cambies el framework preset
4. Build Command: déjalo en `next build` (ya configurado en vercel.json)
5. **NO hagas deploy todavía** — primero configura las variables de entorno (Paso 4)

## 🔐 Paso 4 — Variables de entorno

En Vercel → tu proyecto → **Settings → Environment Variables**, añade:

| Variable | Valor | Obligatoria |
|---|---|---|
| `FIREBASE_PROJECT_ID` | el `project_id` del JSON | ✅ Sí |
| `FIREBASE_CLIENT_EMAIL` | el `client_email` del JSON | ✅ Sí |
| `FIREBASE_PRIVATE_KEY` | la `private_key` del JSON (con `\n` incluidos) | ✅ Sí |
| `JWT_SECRET` | ejecuta `openssl rand -hex 32` localmente y pega el resultado | ✅ Sí |
| `SEED_SECRET` | ejecuta `openssl rand -hex 32` y pega el resultado | ✅ Sí |
| `NEXT_PUBLIC_REALTIME_URL` | (vacío — realtime desactivado por defecto) | ❌ No |
| `REALTIME_INTERNAL_URL` | (vacío) | ❌ No |
| `REALTIME_INTERNAL_TOKEN` | (vacío) | ❌ No |

Marca todas como **Production** (y opcionalmente Preview/Development).

### 💡 Tip para `FIREBASE_PRIVATE_KEY` en Vercel

La private key viene con saltos de línea representados como `\n` literales. Cuando la pegues en Vercel:
- Pégala TAL CUAL viene en el JSON (con `\n` literales)
- NO la envuelvas en comillas adicionales
- El código ya decodifica los `\n` automáticamente

## 🚀 Paso 5 — Deploy

1. Vuelve a **Deployments** → **Deploy**
2. Vercel ejecuta: `npm install` → `next build`
3. El build debe tardar 2-3 minutos. Si falla, revisa los logs.

## 🗄️ Paso 6 — Inicializar la base de datos (UNA SOLA VEZ)

Después del primer deploy exitoso, necesitas crear el admin inicial. A diferencia de PostgreSQL, en Firestore **NO necesitas crear las tablas** — se crean automáticamente al escribir el primer documento.

Solo ejecuta este comando (reemplaza tu dominio y tu SEED_SECRET):

```bash
curl -X POST https://TU-DOMINIO.vercel.app/api/seed \
  -H "x-seed-secret: EL_VALOR_DE_SEED_SECRET"
```

Respuesta esperada:
```json
{
  "success": true,
  "message": "Base de datos inicializada para producción. Se creó 1 administrador.",
  "deletedCounts": { ... },
  "admin": {
    "carnet": "10000001",
    "name": "Administrador EduTECH ESEN",
    "email": "admin@edutech-esen.org",
    "tempPassword": "EduTECH@2025"
  }
}
```

Esto crea las colecciones automáticamente en tu Firestore y deja un único admin.

## 👤 Paso 7 — Primer login

Entra a `https://TU-DOMINIO.vercel.app` e inicia sesión con:
- **Carnet:** `10000001`
- **Contraseña:** `EduTECH@2025`

⚠️ **IMPORTANTE:** Cambia esta contraseña inmediatamente después del primer login (si hay pantalla de perfil) o editando el seed route.

## 🔄 Actualizaciones posteriores

Cada vez que hagas `git push` a `main`, Vercel redespliega automáticamente. No necesitas hacer nada con la BD — Firestore es schemaless, así que los cambios en el código se aplican directo.

## 🔧 Limitaciones conocidas en Vercel

1. **Realtime (WebSocket):** desactivado por defecto. El mini-servicio `mini-services/realtime-service/` no puede correr en Vercel (serverless). Si necesitas notificaciones en tiempo real, despliega ese servicio en Railway/Render/Fly.io y configura `NEXT_PUBLIC_REALTIME_URL` + `REALTIME_INTERNAL_URL` + `REALTIME_INTERNAL_TOKEN`.

2. **Configuración de Email SMTP:** se guarda en `/tmp` (efímero) en Vercel. Se reinicia entre invocaciones serverless. Para persistencia real, migra esa configuración a Firestore (tarea futura).

3. **Archivos generados (reportes ODS .docx):** se devuelven directamente en la respuesta HTTP (no se guardan en servidor). Funciona correctamente en Vercel.

4. **Firestore no tiene JOINs:** las consultas con relaciones (voluntario + comité + actividad) se hacen con múltiples queries en paralelo. Esto es normal en NoSQL y está optimizado en el código.

5. **Firestore no tiene agregaciones nativas (`SUM`, `COUNT` complejos):** se hacen client-side. Para datasets grandes, considera agregar contadores precomputados en los documentos padres.

## 🆘 Troubleshooting

- **Build falla con "JWT_SECRET no configurado":** falta la variable de entorno en Vercel.
- **Login falla con "Firebase no está configurado":** faltan las variables `FIREBASE_*` en Vercel. Verifica que las 3 estén presentes y correctas.
- **`/api/seed` devuelve 403:** `SEED_SECRET` no configurada o el header `x-seed-secret` no coincide.
- **`/api/seed` devuelve 500 con error de permisos Firebase:** verifica que la Service Account Key sea del proyecto correcto y tenga permisos de administrador.
- **404 en rutas:** espera 1-2 min tras el deploy para que las funciones serverless se propaguen.

## 📁 Estructura del proyecto (resumen)

```
src/
  app/api/               # API routes (Next.js)
  components/app/         # UI components
  server/modules/        # Lógica de negocio (estilo NestJS) — USA FIRESTORE
  lib/
    firebase.ts          # Inicialización Firebase Admin SDK
    firestore-helpers.ts # CRUD helpers (findAll, create, update, etc.)
    api.ts               # Cliente API del frontend
vercel.json              # Config Vercel
.env.example             # Template de variables
```

## 🔒 Seguridad Firebase

La Service Account Key que generaste tiene **acceso administrativo total** a tu Firestore. Protégela:
- ✅ Está en variables de entorno de Vercel (seguras)
- ✅ El JSON descargado NO se sube a GitHub (gitignored)
- ✅ Si la pierdes o sospechas compromiso, vuelve a generarla en Firebase Console y actualiza Vercel
- ✅ Configura reglas de Firestore para restringir acceso directo desde el cliente (opcional, la app ya valida todo server-side)
