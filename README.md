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
- **shadcn/ui** (preset `b6SIAAKX9E`, estilo `base-sera`): componentes en `web/components/ui/`,
  sobre **Base UI** (no Radix) e iconos **Hugeicons**. Config en `web/components.json`

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
│   └── drizzle/                # Migraciones SQL versionadas (se aplican al arrancar)
└── web/                        # Frontend Next.js
    ├── Dockerfile  next.config.ts  package.json
    ├── components.json         # config de shadcn (estilo, tokens, alias, iconos)
    ├── app/                    # layout.tsx, page.tsx, globals.css (tokens del tema)
    ├── components/             # Dashboard.tsx, SensorCard.tsx, PairingPanel.tsx, ThemeToggle.tsx
    │   └── ui/                 # componentes de shadcn (button, card, badge, slider…)
    └── lib/                    # api.ts (cliente fetch), sensor.ts, theme.ts, icons.ts
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

### 3. Instalar dependencias

```bash
npm install                 # desde la raíz — instala todos los workspaces
```

No hay que inicializar la base de datos a mano: el backend aplica las migraciones
de `services/drizzle/` al arrancar. Si cambias `services/src/db/schema.ts`, genera
la migración con `npm run -w services db:generate` y commitéala junto al cambio.

### 4. Arrancar en desarrollo local

```bash
npm run dev:api             # backend en http://localhost:3000
npm run dev:web             # frontend en http://localhost:3001
```

El navegador **no** llama al backend directamente: pide rutas relativas `/api/*` y Next
las reescribe al backend (`next.config.ts`), así que es siempre el mismo origen y no hay
CORS de por medio. El destino sale de `BACKEND_URL`, que por defecto es
`http://localhost:3000`; para apuntar a otro: `BACKEND_URL=http://otra-ip:3000 npm run dev:web`.

### 5. Simular sensores (sin hardware)

```bash
npm run mock
```

Publica datos falsos en MQTT cada 10 segundos. El backend los recibe, los guarda en PostgreSQL y aparecen en la UI (polling cada 2 s).

### Persistencia de lecturas

Cada payload MQTT genera una fila por métrica numérica (`power`, `energy`,
`temperature`, `brightness`…) en la tabla `sensor_data`, con la unidad que declara
Zigbee2MQTT en sus `exposes`. Para no crecer al ritmo de publicación de Z2M (unos
10 s por dispositivo) solo se guarda una lectura si su valor cambió o si la última
fila de esa métrica tiene más de 15 minutos.

Consulta: `GET /api/history/<entityId>?metric=power&limit=100`. Si las migraciones
fallaron, el backend arranca igual pero sin histórico — se ve en `db.ready` de
`GET /api/status`.

### Emparejar un dispositivo nuevo

Desde el propio dashboard: **Añadir dispositivo** abre la red Zigbee 120 segundos y
enseña la cuenta atrás y el progreso en vivo (`se ha unido` → `identificando…` →
`listo · SONOFF S60ZBTPF`). Resetea el aparato mientras la ventana esté abierta.

Mientras está abierta **cualquier** dispositivo Zigbee al alcance puede unirse, por
eso el plazo es corto y Z2M la cierra sola aunque nadie pulse nada; el botón pasa a
*Cerrar ahora* para no dejarla abierta por olvido.

    GET  /api/pairing    → { permitJoin, secondsLeft, windowSeconds, error, events }
    POST /api/pairing    {"enable": true}   # o false para cerrar ya

Por debajo es `zigbee2mqtt/bridge/request/permit_join`; el estado se lee de
`bridge/info` y el progreso de `bridge/event`. Borrar dispositivos no está expuesto
a propósito: es destructivo y merece su propio flujo.

### Nombres de los dispositivos

El nombre visible se edita desde el propio dashboard (icono ✏️ en la tarjeta) y se
guarda en la tabla `device_meta`, indexado por la **dirección IEEE** del aparato,
que es inmutable.

Es a propósito que no se renombre en Zigbee2MQTT: allí el nombre visible es el
`friendly_name`, que además de etiqueta es el topic MQTT (`zigbee2mqtt/<nombre>`) y
el `sensor_id` con el que se guarda cada lectura. Cambiarlo movería el topic y
dejaría el histórico anterior colgado del nombre viejo. Con `device_meta` el
identificador técnico no se toca nunca y renombrar es gratis, tantas veces como
quieras.

    PUT    /api/device/<ieee>/name   {"name": "Enchufe salón"}
    DELETE /api/device/<ieee>/name   # vuelve al friendly_name de Z2M

### Dispositivos que no son Zigbee

Zigbee2MQTT solo ve la radio Zigbee. Un aparato WiFi —como el relé Tuya TONGOU—
nunca aparecerá en `bridge/devices`, así que entra por otro sitio: un **puente**
que habla su protocolo por la LAN y lo traduce a MQTT, exactamente el mismo papel
que Z2M juega para Zigbee.

```
relé Tuya ──LAN, protocolo Tuya──▶ tuya-bridge ──MQTT──▶ mosquitto ──▶ backend
```

El puente vive en `tuya-bridge/` (ver su README). Para que el dispositivo salga en
el dashboard se declara en la variable `MQTT_DEVICES` del backend:

```
MQTT_DEVICES=[{"entityId":"rele_cuadro","name":"Relé cuadro","type":"toggle","mqttTopic":"tuya/rele_cuadro"}]
```

A partir de ahí el sistema lo trata como a cualquier otro: encender y apagar, el
histórico de consumo y la tarjeta del dashboard funcionan sin ningún caso especial,
porque lo único que el backend asume de un dispositivo es que publica su estado en
un topic y obedece en `<topic>/set`.

### La interfaz

El dashboard está construido con los componentes de **shadcn/ui** que viven en
`web/components/ui/` (traídos con `npx shadcn add …`, no son una dependencia: son código
del repo y se editan). El preset es `b6SIAAKX9E`, estilo `base-sera`: esquinas rectas,
botones y etiquetas en mayúsculas, Space Grotesk en los títulos e Inter en el cuerpo.

Los colores salen de los tokens de `app/globals.css`, nunca de clases de color a mano, y
los iconos de **Hugeicons** (`@hugeicons/react` + `@hugeicons/core-free-icons`).

**Tema claro/oscuro**: el botón de la cabecera cicla sistema → claro → oscuro. shadcn usa
dark mode por clase (`@custom-variant dark (&:is(.dark *))`), así que el tema es la
presencia de `.dark` en `<html>`; la lógica está en `lib/theme.ts` y el script que la
aplica va inline en el `<head>` para que no haya destello blanco al cargar.

### Todo junto con Docker

```bash
docker-compose up -d        # postgres, mosquitto, zigbee2mqtt, app (:3000), web (:3001)
```

La imagen `web` **hornea** la URL del backend: Next evalúa `rewrites()` en build time, no en
runtime. Se pasa como build-arg `BACKEND_URL` (en la Pi, `http://home_assistant:3000`, el
nombre del container en la red Docker interna). Cambiarla en runtime no tiene efecto: hay
que reconstruir la imagen.

## Producción (Raspberry Pi)

1. Conectar el dongle Zigbee USB
2. En `docker-compose.yml`, descomentar la línea `devices` para mapear `/dev/ttyACM0`
3. Emparejar dispositivos desde el propio dashboard (**Añadir dispositivo**); la UI de
   Zigbee2MQTT en http://localhost:8080 sigue disponible para lo que no está expuesto
4. Los dispositivos publicarán automáticamente en MQTT y el backend los procesará
