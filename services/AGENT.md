# AGENT Context: Servicios Backend (Node.js)

## Contexto
Este directorio contiene el microservicio "Custom Backend" desarrollado en Node.js. Su función es interactuar con la API de Home Assistant, gestionar la persistencia de datos históricos de sensores en PostgreSQL usando Drizzle ORM, y proveer herramientas de simulación (mocking) para desarrollo local.

## Distribución de Carpetas

- **`src/`**: Código fuente TypeScript.
    - **`db/`**: Definiciones de esquema de base de datos (`schema.ts`).
    - **`index.ts`**: Punto de entrada de la aplicación.
    - **`mock_sensors.ts`**: Script para inyectar datos falsos en Home Assistant.
- **`drizzle/`**: Migraciones de base de datos generadas automáticamente.
- **`Dockerfile`**: Definición del contenedor para despliegue en Docker.

## Cómo Arrancar esta Parcela (Desarrollo y Lógica)

### 1. Instalación de Dependencias
```bash
npm install
```

### 2. Gestión de Base de Datos (Drizzle)
Antes de arrancar la lógica, asegura que la BD está sincronizada.
```bash
# Sincronizar esquema local con la BD remota/Docker
npm run db:push

# Generar archivos de migración SQL (si es necesario)
npm run db:generate
```

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
# Ejecuta un script que envía datos periódicos a Home Assistant
npm run mock
```
*Nota: Requiere que Home Assistant esté corriendo y el token configurado en `.env`.*
