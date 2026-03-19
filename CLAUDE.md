# CLAUDE.md

## Project Overview

Home Control - Proyecto Andorra. Sistema de domótica custom basado en Raspberry Pi. Control directo de sensores y actuadores vía Zigbee2MQTT + MQTT, sin Home Assistant. Backend en Node.js/TypeScript con PostgreSQL.

## Architecture

```
Sensors ← Zigbee → Zigbee2MQTT → Mosquitto (MQTT) → Node.js Backend → PostgreSQL
                                                          ↓
                                                       API REST → UI / PWA
```

Services (Docker Compose):
- **postgres**: PostgreSQL 16 for sensor data persistence (port 5432)
- **mosquitto**: MQTT broker for device communication (port 1883)
- **zigbee2mqtt**: Zigbee device management (port 8080, requires USB dongle on RPi)
- **app**: Custom Node.js/TypeScript backend (port 3000)

## Tech Stack

- **Runtime**: Node.js 20 (Alpine) with TypeScript 5.9
- **HTTP**: Express 5
- **MQTT**: mqtt.js for subscribing/publishing to Mosquitto
- **ORM**: Drizzle ORM 0.45.1 (PostgreSQL dialect)
- **DB**: PostgreSQL 16
- **Zigbee**: Zigbee2MQTT
- **Config**: dotenv (`.env` at project root)

## Project Structure

```
├── docker-compose.yml
├── .env / .env.example
├── data/                       # Persistent volumes (git-ignored)
│   ├── postgres/
│   ├── mosquitto/
│   └── zigbee2mqtt/
└── services/                   # Node.js backend
    ├── Dockerfile
    ├── drizzle.config.ts
    ├── package.json
    └── src/
        ├── index.ts            # Main backend (Express + MQTT + Drizzle)
        ├── sensors.ts          # Sensor definitions (shared config)
        ├── mock_sensors.ts     # MQTT-based sensor simulator
        └── db/
            └── schema.ts       # sensorData table (Drizzle)
```

## Key Commands

```bash
# Infrastructure
docker-compose up -d            # Start all services
docker-compose logs -f          # Follow logs

# Backend (from ./services/)
npm install                     # Install dependencies
npm start                       # Run backend (Express + MQTT listener)
npm run mock                    # Simulate sensors via MQTT
npm run db:push                 # Apply schema to PostgreSQL
npm run db:generate             # Generate migration files
```

## API Endpoints

- `GET  /api/sensors`           — List all sensors with current state
- `GET  /api/sensor/:entityId`  — Get current state of a sensor
- `POST /api/sensor/:entityId`  — Control a device (publishes to MQTT)
- `GET  /api/history/:entityId` — Query historical data from PostgreSQL

## Database Schema

Single table `sensor_data`:
- `id`: serial PK
- `sensor_id`: text (device identifier)
- `type`: text (light, toggle, slider)
- `value`: double precision (nullable)
- `unit`: text (nullable)
- `timestamp`: auto-generated

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
- `TZ` — Timezone (Europe/Andorra)

## Conventions

- TypeScript for all backend code
- Drizzle ORM for database operations
- MQTT for all device communication (no direct hardware access)
- Sensor definitions centralized in `src/sensors.ts`
- Environment variables loaded via dotenv from root `.env`
- Docker Compose for all service management
- Project documentation in Spanish
