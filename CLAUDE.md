# CLAUDE.md

## Project Overview

Home Assistant Node - Proyecto Andorra. A centralized home automation hub based on Raspberry Pi for controlling smart home sensors and actuators using Home Assistant, Node.js/TypeScript, and PostgreSQL. All services run via Docker Compose.

## Architecture

- **homeassistant**: Core HA platform (port 8123)
- **postgres**: PostgreSQL 16 for sensor data persistence (port 5432)
- **mosquitto**: MQTT broker for device communication (port 1883)
- **zigbee2mqtt**: Zigbee device management (port 8080, requires USB dongle on RPi)
- **app**: Custom Node.js/TypeScript backend (`./services/`)

All services are orchestrated via `docker-compose.yml`. Persistent data lives in `data/` (git-ignored).

## Tech Stack

- **Runtime**: Node.js 20 (Alpine) with TypeScript 5.9
- **ORM**: Drizzle ORM 0.45.1 (PostgreSQL dialect)
- **HTTP**: Axios for HA API calls
- **MQTT**: Mosquitto 2
- **Zigbee**: Zigbee2MQTT
- **Config**: dotenv (`.env` at project root)

## Project Structure

```
├── docker-compose.yml          # Service orchestration
├── .env / .env.example         # Environment config
├── data/                       # Persistent volumes (git-ignored)
│   ├── homeassistant/          # HA config
│   ├── postgres/               # DB files
│   ├── mosquitto/              # MQTT config/data/logs
│   └── zigbee2mqtt/            # Zigbee data
└── services/                   # Node.js backend
    ├── Dockerfile              # Node 20 Alpine image
    ├── drizzle.config.ts       # ORM config
    ├── package.json            # Dependencies & scripts
    └── src/
        ├── index.ts            # Main entry point (pg pool + sensor schema)
        ├── mock_sensors.ts     # Simulates 6 sensor types via HA API
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
npm start                       # Run main service (ts-node src/index.ts)
npm run mock                    # Run sensor simulation
npm run db:push                 # Apply schema to PostgreSQL
npm run db:generate             # Generate migration files
```

## Database Schema

Single table `sensor_data`:
- `id`: serial PK
- `sensor_id`: text (device identifier)
- `type`: text (temp, humidity, presence, etc.)
- `value`: double precision (nullable)
- `unit`: text (nullable, e.g. °C, %, W)
- `timestamp`: auto-generated

## Environment Variables

Defined in `.env` (see `.env.example` for template):
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` — DB credentials
- `DATABASE_URL` — Full connection string for Drizzle/pg
- `HASS_TOKEN` — Long-lived access token from HA
- `HASS_URL` — HA base URL (http://localhost:8123 dev, http://homeassistant:8123 docker)
- `HASS_TIMEZONE` — Europe/Andorra
- `MQTT_USER`, `MQTT_PASSWORD` — MQTT broker credentials
- `DOCKER_NETWORK_MODE` — `bridge` (macOS dev) or `host` (RPi prod)

## Development vs Production

- **Dev (macOS)**: `network_mode: bridge` with exposed ports. No USB device mapping.
- **Prod (RPi)**: `network_mode: host` for mDNS/UPnP device discovery. Map `/dev/ttyACM0` for Zigbee dongle.

## Conventions

- TypeScript for all backend code
- Drizzle ORM for database operations (no raw SQL unless necessary)
- Environment variables loaded via dotenv from root `.env`
- Docker Compose for all service management
- Language: project documentation is in Spanish
