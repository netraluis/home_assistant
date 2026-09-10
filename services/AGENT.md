# AGENT Context: Servicios Backend (Node.js)

## Contexto
Este directorio contiene el backend en Node.js. **No hay Home Assistant en ninguna parte**:
el backend habla MQTT directamente con Mosquitto, descubre los dispositivos por los topics
`zigbee2mqtt/bridge/*` de Zigbee2MQTT, guarda el histórico de sensores en PostgreSQL con
Drizzle ORM y expone la API REST que consume el frontend. También trae un simulador para
desarrollar sin hardware.

## Distribución de Carpetas

- **`src/`**: Código fuente TypeScript.
    - **`db/`**: Definiciones de esquema de base de datos (`schema.ts`).
    - **`index.ts`**: Punto de entrada de la aplicación.
    - **`mock_sensors.ts`**: Script que publica lecturas falsas en MQTT.
    - **`sensors.ts`**: Definición estática de sensores (fallback cuando Z2M no responde).
- **`drizzle/`**: Migraciones de base de datos generadas automáticamente.
- **`Dockerfile`**: Definición del contenedor. Se construye desde la **raíz** del monorepo
  (`docker build -f services/Dockerfile .`) e instala solo los workspaces `services` y
  `packages/shared`: un `npm ci` sin acotar arrastraría el árbol de `web` (Next, Base UI…),
  que no pinta nada aquí y que bajo la emulación QEMU arm64 del CI hace segfault a npm.

## Cómo Arrancar esta Parcela (Desarrollo y Lógica)

### 1. Instalación de Dependencias
```bash
npm install
```

### 2. Gestión de Base de Datos (Drizzle)
El esquema se versiona con migraciones en `drizzle/`, que se aplican **solas al
arrancar** el backend (`migrate()` de drizzle-orm en `src/index.ts`). En un
despliegue normal no hay que ejecutar nada a mano.

Al cambiar `src/db/schema.ts`:
```bash
# 1. Generar el SQL de la migración (offline, no necesita BD)
npm run db:generate

# 2. Commitear drizzle/ junto al cambio de esquema.
#    El siguiente arranque del contenedor la aplica.

# Aplicar migraciones pendientes a mano contra una BD concreta:
DATABASE_URL=postgres://... npm run db:migrate

# Solo para desarrollo rápido: sincroniza el esquema sin generar migración
npm run db:push
```
*Nota: `drizzle-kit` es devDependency y el `Dockerfile` hace `npm prune --omit=dev`,
así que no existe dentro de la imagen; el runtime solo usa `migrate()`.*

### 3. Ejecución de Lógica
**Modo Producción (dentro de Docker):**
El `Dockerfile` ejecuta `npm start` automáticamente.

**Modo Desarrollo (Local):**
```bash
# Iniciar el servicio backend
npm start
```

### 4. Simulación (Mocking)
Para simular sensores sin tener hardware real conectado:
```bash
# Publica lecturas periódicas en MQTT; el backend las trata como si fueran reales
npm run mock
```
*Nota: requiere que Mosquitto esté levantado (`docker compose up -d mosquitto`).*
