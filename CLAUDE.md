# CLAUDE.md

## Project Overview

Home Control - Proyecto Andorra. Sistema de domótica custom basado en Raspberry Pi. Control directo de sensores y actuadores vía Zigbee2MQTT + MQTT, sin Home Assistant. Backend en Node.js/TypeScript con PostgreSQL.

## Architecture

```
Sensors ← Zigbee → Zigbee2MQTT → Mosquitto (MQTT) → Node.js Backend → PostgreSQL
                                                          ↓
                                                       API REST → Next.js Web (PWA)
```

Monorepo (npm workspaces): `services/` (backend), `web/` (frontend), `packages/shared/` (tipos compartidos).

Services (Docker Compose):
- **postgres**: PostgreSQL 16 for sensor data persistence (internal only — the published
  `5432` was removed; reach it through the container or an SSH tunnel)
- **mosquitto**: MQTT broker for device communication (port 1883)
- **zigbee2mqtt**: Zigbee device management (port 8080, requires USB dongle on RPi)
- **app**: Custom Node.js/TypeScript backend (:3000, internal network only)
- **web**: Next.js frontend (:3001) — the only public face

## Tech Stack

- **Runtime**: Node.js 20 (Alpine) with TypeScript 5.9
- **HTTP**: Express 5
- **MQTT**: mqtt.js for subscribing/publishing to Mosquitto
- **ORM**: Drizzle ORM 0.45.1 (PostgreSQL dialect)
- **DB**: PostgreSQL 16
- **Zigbee**: Zigbee2MQTT
- **Frontend**: Next.js 16 (App Router, Turbopack) + React 19 + Tailwind 4
- **UI**: shadcn/ui, preset `b6SIAAKX9E` / style `base-sera`, on **Base UI** (not Radix),
  icons from **Hugeicons**. Components are vendored in `web/components/ui/`
- **Config**: dotenv (`.env` at project root)

## Project Structure

```
├── package.json                # npm workspaces root (scripts dev:api / dev:web)
├── docker-compose.yml
├── .env / .env.example
├── .github/workflows/
│   ├── build-api.yml           # builds services/ image on changes to services/**
│   └── build-web.yml           # builds web/ image on changes to web/** | packages/**
├── data/                       # Persistent volumes (git-ignored)
│   ├── postgres/  mosquitto/  zigbee2mqtt/
├── packages/
│   └── shared/                 # @home/shared — tipos compartidos (SensorDef, Scene, payloads API)
│       └── src/index.ts
├── services/                   # Node.js backend
│   ├── Dockerfile  drizzle.config.ts  package.json
│   └── src/
│       ├── index.ts            # Express + MQTT + Drizzle + CORS
│       ├── sensors.ts          # Sensor definitions
│       ├── mock_sensors.ts     # MQTT-based sensor simulator
│       └── db/schema.ts        # sensorData table (Drizzle)
│   └── drizzle/                # Migraciones SQL generadas (en git, se aplican al arrancar)
└── web/                        # Next.js frontend
    ├── Dockerfile  next.config.ts  package.json
    ├── components.json         # shadcn config (style, tokens, aliases, icon library)
    ├── app/                    # layout.tsx, page.tsx (renders <Dashboard/>), globals.css
    ├── components/             # Dashboard.tsx, SensorCard.tsx, PairingPanel.tsx, ThemeToggle.tsx
    │   └── ui/                 # shadcn components (button, card, badge, slider, ...)
    └── lib/                    # api.ts (fetch client), sensor.ts, theme.ts, icons.ts
```

**Frontend ↔ backend**: el navegador pide rutas relativas `/api/*` y Next las reescribe al
backend (`next.config.ts`), o sea mismo origen y sin CORS. El destino es `BACKEND_URL`, que
Next evalúa **en build time** (`rewrites()` se serializa al construir), así que se pasa como
build-arg de la imagen y cambiarlo en runtime no tiene efecto: hay que reconstruir.
El backend sigue con CORS habilitado, pero por esta ruta no hace falta.

## Key Commands

```bash
# Infrastructure
docker-compose up -d            # Start all services (incl. web on :3001)
docker-compose logs -f          # Follow logs

# Dev (from repo root — npm workspaces)
npm install                     # Install all workspaces
npm run dev:api                 # Backend (ts-node, Express + MQTT) on :3000
npm run dev:web                 # Next.js dev server on :3001
npm run mock                    # Simulate sensors via MQTT
npm run -w services db:generate # Generate SQL migration from schema changes
npm run -w services db:migrate  # Apply pending migrations manually
npm run -w services db:push     # Push schema without migrations (dev only)

# Frontend prod build
npm run build:web
```

## API Endpoints

- `GET  /api/status`            — MQTT connection status + uptime
- `GET  /api/sensors`           — List all sensors with current state
- `GET  /api/sensor/:entityId`  — Get current state of a sensor
- `POST /api/sensor/:entityId`  — Control a device (publishes to MQTT)
- `GET  /api/history/:entityId` — Query historical data from PostgreSQL (`?metric=power`, `?limit=N` up to 1000)
- `GET  /api/pairing`           — Permit-join state, seconds left and recent join events
- `POST /api/pairing`           — Open/close the pairing window (`{ "enable": true }`)
- `PUT    /api/device/:ieeeAddress/name` — Set the display name (`{ "name": "Enchufe salón" }`)
- `DELETE /api/device/:ieeeAddress/name` — Clear it, falling back to the Zigbee2MQTT `friendly_name`

## Database Schema

### `sensor_data`
- `id`: serial PK
- `sensor_id`: text (device identifier)
- `type`: text (light, toggle, slider)
- `metric`: text, nullable (`power`, `energy`, `temperature`, `brightness`, ...)
- `value`: double precision (nullable)
- `unit`: text (nullable)
- `timestamp`: auto-generated
- index on `(sensor_id, timestamp DESC)`

One row per numeric metric of each MQTT payload: a metering plug is `type: toggle`
but yields `power`, `energy`, `voltage` and `current` rows. Units come from the
Zigbee2MQTT `exposes`, falling back to a static map.

### `device_meta`

- `ieee_address`: text PK — the device's IEEE address, burned into the chip
- `display_name`: text
- `updated_at`: auto-generated

Display names live here, **not** in Zigbee2MQTT. Renaming through Z2M would change
the `friendly_name`, which is both the MQTT topic and the `sensor_id` written to
`sensor_data` — every existing reading would be orphaned under the old name. Keying
on the IEEE address instead makes a rename a single `UPDATE` with no side effects.
`entityId` stays the `friendly_name`; only `name` is overridden, from an in-memory
cache refreshed on every write (`getAllSensors()` is synchronous and runs per
request, so it cannot hit the DB).

To keep the table from growing at the MQTT publish rate (~10s per device), a
reading is only stored when its value changed or when the last row for that
`(sensor_id, metric)` is older than 15 minutes.

### Migrations

Versioned Drizzle migrations live in `services/drizzle/` (committed). The backend
applies pending migrations on startup via `migrate()` from `drizzle-orm`, so a
fresh deploy provisions its own schema — `drizzle-kit` is a devDependency and is
**not** in the runtime image. If migrations fail the backend still boots and
serves live state; only history is disabled (`db.ready: false` in `/api/status`).

## MQTT Topics

- **Receive**: `zigbee2mqtt/<device_name>` — device state updates (JSON)
- **Control**: `zigbee2mqtt/<device_name>/set` — send commands to devices

## Environment Variables

Defined in `.env` (see `.env.example`):
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` — DB credentials
- `DATABASE_URL` — Full connection string
- `MQTT_HOST`, `MQTT_PORT` — MQTT broker (default: localhost:1883)
- `MQTT_USER`, `MQTT_PASSWORD` — MQTT auth
- `PORT` — Backend port (default: 3000)
- `CORS_ORIGIN` — Allowed origins for the backend, comma-separated (empty = allow all, dev)
- `BACKEND_URL` — Where Next rewrites `/api/*`. Baked at **build time** (build-arg of the web
  image; `http://home_assistant:3000` on the Pi). Also honoured by `npm run dev:web`.
  Default `http://localhost:3000`
- `TZ` — Timezone (Europe/Andorra)

## Conventions

- TypeScript everywhere (backend, frontend, shared)
- npm workspaces — run scripts from the repo root (`npm run -w <ws> ...`) or use root aliases
- Shared types live in `packages/shared` (`@home/shared`); the frontend imports them, the backend keeps its own `sensors.ts` mirror (avoids `rootDir` issues in tsc)
- Drizzle ORM for database operations
- MQTT for all device communication (no direct hardware access)
- Sensor definitions centralized in `services/src/sensors.ts`
- Frontend = Next.js App Router; interactive UI lives in client components under `web/components/`
- **Always build the UI from the shadcn components in `web/components/ui/`** — don't hand-roll
  a `<button>` or `<div>` card. They are vendored code: edit them in place to change the look
- Colours come from the theme tokens (`bg-card`, `text-muted-foreground`, `bg-primary`…), never
  from hard-coded palette classes like `bg-zinc-100`, so light/dark and the preset keep working
- Icons come from Hugeicons (`<HugeiconsIcon icon={...} />`), not emoji. The `icon` field the
  backend sends is an emoji and is deliberately ignored; the type → icon map is `lib/icons.ts`
- Dark mode is **class-based** (`.dark` on `<html>`), driven by `lib/theme.ts`
- Environment variables loaded via dotenv from root `.env`
- Docker Compose for all service management
- Project documentation in Spanish
