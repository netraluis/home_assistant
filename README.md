# Home Control - Proyecto Andorra

Sistema de domótica custom basado en Raspberry Pi para el control de sensores y actuadores de un hogar inteligente, usando Node.js, MQTT y PostgreSQL. Sin Home Assistant — control directo vía Zigbee2MQTT.

## Arquitectura

```
Sensores ← Zigbee → Dongle USB → Zigbee2MQTT → Mosquitto (MQTT) → Node.js Backend
                                                                        ↓
                                                                   PostgreSQL
                                                                        ↓
                                                                    API REST
                                                                        ↓
                                                                   UI / PWA
```

## Hardware Necesario

### Servidor Central
- **Raspberry Pi 4 o 5** (4GB RAM o superior)
- **SSD Externo (SATA o NVMe)**: Para evitar fallos de la tarjeta SD
- **Fuente de Alimentación Oficial**

### Conectividad Zigbee
- **Zigbee Dongle USB**: (Ej: Sonoff ZBDongle-E o ZBDongle-P)

### Sensores y Actuadores
- **Iluminación**: Bombillas **IKEA Tradfri** (Zigbee)
- **Presencia**: **Aqara FP2** (mmWave, Wi-Fi)
- **Clima**: Válvulas termostáticas Zigbee (Ej: **Aqara TRV**, **Moes**, **Danfoss Ally**)
- **Seguridad**:
    - Sensores de inundación (Ej: **Aqara Water Leak Sensor**)
    - Sensores de puertas/ventanas (Ej: **Aqara Door and Window Sensor**)
    - Control Vitrocerámica: **Shelly EM** con pinza amperimétrica

## Stack Tecnológico

- **Node.js + TypeScript**: Backend, API REST y lógica de negocio
- **Express**: Servidor HTTP y API
- **MQTT (mqtt.js)**: Comunicación con dispositivos vía Mosquitto
- **PostgreSQL**: Persistencia de datos e históricos
- **Drizzle ORM**: Interacción con la base de datos
- **Zigbee2MQTT**: Gestión de la red Zigbee
- **Mosquitto**: Broker MQTT
- **Next.js 16 + React 19 + Tailwind 4**: Frontend / PWA (`web/`)

## Estructura del Proyecto

Monorepo con npm workspaces: `services/` (backend), `web/` (frontend), `packages/shared/` (tipos compartidos).

```
├── package.json                # Raíz npm workspaces (npm run dev:api / dev:web)
├── docker-compose.yml          # Orquestación de contenedores
├── .env / .env.example         # Configuración
├── .github/workflows/          # build-api.yml, build-web.yml (imágenes Docker arm64)
├── data/                       # Volúmenes persistentes (git-ignored)
│   ├── postgres/  mosquitto/  zigbee2mqtt/
├── packages/shared/src/index.ts  # @home/shared: SensorDef, Scene, payloads API
├── services/                   # Backend Node.js
│   ├── Dockerfile  package.json  drizzle.config.ts
│   └── src/
│       ├── index.ts            # Backend principal (Express + MQTT + DB + CORS)
│       ├── sensors.ts          # Definición de sensores
│       ├── mock_sensors.ts     # Simulación de sensores vía MQTT
│       └── db/schema.ts        # Schema de PostgreSQL (Drizzle)
└── web/                        # Frontend Next.js
    ├── Dockerfile  next.config.ts  package.json
    ├── app/                    # layout.tsx, page.tsx
    ├── components/             # Dashboard.tsx, SensorCard.tsx
    └── lib/                    # api.ts (cliente fetch), sensor.ts (helpers de estado)
```

## Instrucciones de Inicio

### 1. Configuración

```bash
cp .env.example .env
# Editar .env con tus credenciales
```

### 2. Levantar la infraestructura

```bash
docker-compose up -d
```

Esto levanta: PostgreSQL, Mosquitto, Zigbee2MQTT y el backend Node.js.

### 3. Instalar dependencias e inicializar la base de datos

```bash
npm install                 # desde la raíz — instala todos los workspaces
npm run -w services db:push
```

### 4. Arrancar en desarrollo local

```bash
npm run dev:api             # backend en http://localhost:3000
npm run dev:web             # frontend en http://localhost:3001
```

El frontend (Next.js) llama al backend por HTTP; CORS está habilitado en el backend.
Para apuntar a otro backend: `NEXT_PUBLIC_API_URL=http://otra-ip:3000 npm run dev:web`.

### 5. Simular sensores (sin hardware)

```bash
npm run mock
```

Publica datos falsos en MQTT cada 10 segundos. El backend los recibe, los guarda en PostgreSQL y aparecen en la UI (polling cada 2 s).

### Todo junto con Docker

```bash
docker-compose up -d        # postgres, mosquitto, zigbee2mqtt, app (:3000), web (:3001)
```

La imagen `web` hornea la URL del backend en build time: ajusta `WEB_API_URL` en `.env` si el navegador no accede al backend por `http://localhost:3000`.

## Producción (Raspberry Pi)

1. Conectar el dongle Zigbee USB
2. En `docker-compose.yml`, descomentar la línea `devices` para mapear `/dev/ttyACM0`
3. Emparejar dispositivos desde el panel de Zigbee2MQTT (http://localhost:8080)
4. Los dispositivos publicarán automáticamente en MQTT y el backend los procesará
