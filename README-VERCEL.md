# 🚀 Despliegue en Vercel — EduTECH ESEN

Guía paso a paso para desplegar este proyecto en Vercel.

## ⚠️ Requisitos previos

El proyecto usa **PostgreSQL** (no SQLite). Necesitas una base de datos PostgreSQL.
Recomendamos **Neon** (gratuito, integración nativa con Vercel):
1. Crea cuenta en https://neon.tech
2. Crea un proyecto → obtén la `DATABASE_URL` (formato: `postgresql://user:pass@host/db?sslmode=require`)

Alternativas: Supabase (https://supabase.com) o Vercel Postgres (desde el dashboard de Vercel).

## 📦 Paso 1 — Subir el código a GitHub

1. Inicializa git (si no está inicializado) y conecta tu repo:
   ```bash
   git init
   git add .
   git commit -m "Initial commit — EduTECH ESEN"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/edutech-esen.git
   git push -u origin main
   ```
2. Crea el repo en GitHub primero (vacío, sin README ni .gitignore).
3. **Notas importantes:**
   - `.env` está en `.gitignore` → NO se sube (correcto, contiene secretos del sandbox).
   - `.env.example` SÍ se sube → es solo un template con los nombres de las variables.
   - `db/`, `upload/`, `download/`, `node_modules/`, `tool-results/`, `agent-ctx/`, `*.log`, `*.pid`, `worklog.md` y `mini-services/` están en `.gitignore` y `.vercelignore` → no se suben ni se despliegan.

## 🌐 Paso 2 — Importar en Vercel

1. Entra a https://vercel.com → **Add New → Project**
2. Importa tu repo de GitHub
3. Vercel auto-detecta Next.js — NO cambies el framework preset
4. Build Command: déjalo en `next build` (ya configurado en vercel.json)
5. Install Command: `npm install` (ya configurado)
6. NO toques Output Directory (Vercel lo maneja)
7. **NO hagas deploy todavía** — primero configura las variables de entorno (Paso 3)

## 🔐 Paso 3 — Variables de entorno

En Vercel → tu proyecto → **Settings → Environment Variables**, añade:

| Variable | Valor | Obligatoria |
|---|---|---|
| `DATABASE_URL` | `postgresql://...` (de Neon/Supabase) | ✅ Sí |
| `JWT_SECRET` | ejecuta `openssl rand -hex 32` localmente y pega el resultado | ✅ Sí |
| `SEED_SECRET` | ejecuta `openssl rand -hex 32` y pega el resultado | ✅ Sí |
| `NEXT_PUBLIC_REALTIME_URL` | (vacío — realtime desactivado por defecto) | ❌ No |
| `REALTIME_INTERNAL_URL` | (vacío) | ❌ No |
| `REALTIME_INTERNAL_TOKEN` | (vacío) | ❌ No |

Marca todas como **Production** (y opcionalmente Preview/Development).

> ⚠️ En producción, si falta `JWT_SECRET`, el build/runtime fallará explícitamente con un error claro (fail-closed). En desarrollo usa un fallback hardcodeado (solo sandbox).

## 🚀 Paso 4 — Deploy

1. Vuelve a **Deployments** → **Deploy**
2. Vercel ejecuta: `npm install` → `postinstall: prisma generate` → `next build`
3. El build debe tardar 2-4 minutos. Si falla, revisa los logs.

## 🗄️ Paso 5 — Inicializar la base de datos (UNA SOLA VEZ)

Después del primer deploy exitoso, necesitas crear las tablas y el admin inicial:

### Opción A — Con Vercel CLI (recomendada)
```bash
npm i -g vercel
vercel login
cd tu-repo-local
vercel link        # vincula tu repo local con el proyecto de Vercel
# Descarga las variables de entorno a .env.local:
vercel env pull .env.local
# Crea las tablas con la migración baseline:
npx prisma migrate deploy
# Crea el admin inicial (necesitas el SEED_SECRET):
curl -X POST https://TU-DOMINIO.vercel.app/api/seed \
  -H "x-seed-secret: EL_VALOR_DE_SEED_SECRET"
```

### Opción B — Solo con curl (las tablas se crean con prisma db push desde Neon)
1. En Neon, abre el SQL editor y pega el contenido de `prisma/migrations/0_init/migration.sql` → ejecuta
2. Luego crea el admin:
```bash
curl -X POST https://TU-DOMINIO.vercel.app/api/seed \
  -H "x-seed-secret: EL_VALOR_DE_SEED_SECRET"
```

## 👤 Paso 6 — Primer login

Entra a `https://TU-DOMINIO.vercel.app` e inicia sesión con:
- **Carnet:** `10000001`
- **Contraseña:** `EduTECH@2025`

⚠️ **IMPORTANTE:** Cambia esta contraseña inmediatamente después del primer login (si hay pantalla de perfil) o editando el seed route.

## 🔄 Actualizaciones posteriores

Cada vez que hagas `git push` a `main`, Vercel redespliega automáticamente.
Si cambias `prisma/schema.prisma`, genera una nueva migración localmente:
```bash
npx prisma migrate dev --name descripcion-del-cambio
git add prisma/migrations
git commit -m "migracion: ..."
git push
```
Y en Vercel, ejecuta `npx prisma migrate deploy` (vía CLI) para aplicarla.

## 🔧 Limitaciones conocidas en Vercel

1. **Realtime (WebSocket):** desactivado por defecto. El mini-servicio `mini-services/realtime-service/` no puede correr en Vercel (serverless). Si necesitas notificaciones en tiempo real, despliega ese servicio en Railway/Render/Fly.io y configura `NEXT_PUBLIC_REALTIME_URL` + `REALTIME_INTERNAL_URL` + `REALTIME_INTERNAL_TOKEN`.

2. **Configuración de Email SMTP y Firebase:** se guarda en `/tmp` (efímero) en Vercel. Se reinicia entre invocaciones serverless. Para persistencia real, migra esa configuración a la base de datos (tarea futura).

3. **Archivos generados (reportes ODS .docx):** se devuelven directamente en la respuesta HTTP (no se guardan en servidor). Funciona correctamente en Vercel.

## 🆘 Troubleshooting

- **Build falla con "JWT_SECRET no configurado":** falta la variable de entorno en Vercel.
- **Login falla con error de DB:** `DATABASE_URL` no es PostgreSQL o las tablas no están creadas (ejecuta el Paso 5).
- **`/api/seed` devuelve 403:** `SEED_SECRET` no configurada o el header `x-seed-secret` no coincide.
- **404 en rutas:** espera 1-2 min tras el deploy para que las funciones serverless se propaguen.

## 📁 Estructura del proyecto (resumen)

```
prisma/
  schema.prisma          # Schema PostgreSQL
  migrations/0_init/     # Migración baseline
src/
  app/api/               # API routes (Next.js)
  components/app/         # UI components
  server/modules/        # Lógica de negocio (estilo NestJS)
  lib/                   # Utilidades (auth, api, validation)
vercel.json              # Config Vercel
.env.example             # Template de variables
```
