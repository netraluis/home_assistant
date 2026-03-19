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

## Estructura del Proyecto

```
├── docker-compose.yml          # Orquestación de contenedores
├── .env / .env.example         # Configuración
├── data/                       # Volúmenes persistentes (git-ignored)
│   ├── postgres/
│   ├── mosquitto/
│   └── zigbee2mqtt/
└── services/                   # Backend Node.js
    ├── Dockerfile
    ├── package.json
    ├── drizzle.config.ts
    └── src/
        ├── index.ts            # Backend principal (Express + MQTT + DB)
        ├── sensors.ts          # Definición de sensores
        ├── mock_sensors.ts     # Simulación de sensores vía MQTT
        └── db/
            └── schema.ts       # Schema de PostgreSQL (Drizzle)
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

### 3. Inicializar la base de datos

```bash
cd services
npm install
npm run db:push
```

### 4. Arrancar el backend (desarrollo local)

```bash
npm start
# Abre http://localhost:3000
```

### 5. Simular sensores (sin hardware)

```bash
npm run mock
```

Publica datos falsos en MQTT cada 10 segundos. El backend los recibe, los guarda en PostgreSQL y los muestra en la UI.

## Producción (Raspberry Pi)

1. Conectar el dongle Zigbee USB
2. En `docker-compose.yml`, descomentar la línea `devices` para mapear `/dev/ttyACM0`
3. Emparejar dispositivos desde el panel de Zigbee2MQTT (http://localhost:8080)
4. Los dispositivos publicarán automáticamente en MQTT y el backend los procesará
