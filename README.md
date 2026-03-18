# Home Assistant Node - Proyecto Andorra

Este proyecto consiste en un nodo centralizado basado en Raspberry Pi para el control de sensores y actuadores de un hogar inteligente, utilizando Home Assistant, Node.js y PostgreSQL.

## Hardware Necesario

### 1. Servidor Central
- **Raspberry Pi 4 o 5** (Se recomienda 4GB de RAM o superior).
- **SSD Externo (SATA o NVMe)**: Para evitar fallos prematuros de la tarjeta SD debido a las escrituras de la base de datos.
- **Fuente de Alimentación Oficial**: Para asegurar estabilidad de voltaje.

### 2. Conectividad Zigbee
- **Zigbee Dongle USB**: (Ej: Sonoff ZBDongle-E o ZBDongle-P). Esencial para conectar dispositivos Zigbee sin depender de hubs propietarios.

### 3. Sensores y Actuadores
- **Iluminación**: Bombillas **IKEA Tradfri** (Protocolo Zigbee).
- **Presencia**: **Aqara FP2** (Sensor mmWave). *Nota: El FP2 se conecta vía Wi-Fi, pero se integra muy bien con Home Assistant.*
- **Clima**: Válvulas termostáticas (TRV) Zigbee (Ej: **Aqara TRV**, **Moes** o **Danfoss Ally**).
- **Seguridad**:
    - Sensores de inundación Zigbee (Ej: **Aqara Water Leak Sensor**).
    - Sensores de apertura de puertas/ventanas Zigbee (Ej: **Aqara Door and Window Sensor**).
    - **Control Vitrocerámica**: Para detectar si la vitro está encendida, se recomienda un **Shelly EM** con pinza amperimétrica en el cuadro eléctrico o un sensor de temperatura/vibración específico si es posible.

## Stack Tecnológico
- **Home Assistant Container**: El núcleo de la domótica.
- **Node.js**: Para servicios personalizados y lógica de negocio.
- **PostgreSQL**: Base de datos para persistencia a largo plazo.
- **Drizzle ORM**: Para la interacción con la base de datos desde Node.js.
- **Zigbee2MQTT**: Para gestionar la red Zigbee de forma abierta y potente.
- **Mosquitto MQTT**: Broker para la comunicación entre dispositivos.

## Estructura del Proyecto
- `/data`: Volúmenes persistentes de Docker.
- `/services`: Código fuente de los microservicios en Node.js.
- `docker-compose.yml`: Orquestación de contenedores.

## Instrucciones de Inicio

1. **Configuración Inicial**:
   - Copia `.env.example` a `.env` y ajusta las credenciales.
   - Si estás en macOS, Docker Desktop ya maneja la virtualización. En RPi, asegúrate de tener Docker y Docker Compose instalados.

2. **Levantar la Infraestructura**:
   ```bash
   docker-compose up -d
   ```

3. **Simulación de Sensores (Mocking)**:
   Para probar la API de Home Assistant sin hardware real:
   - **Obtener Token de Acceso**: 
     1. Entra en `http://localhost:8123`.
     2. Crea tu cuenta de usuario si es la primera vez.
     3. Haz clic en tu **Perfil** (círculo con tus iniciales abajo a la izquierda).
     4. Ve a la pestaña **Seguridad** y baja hasta el final.
     5. Haz clic en **Crear Token** en la sección "Tokens de acceso de larga duración".
     6. Ponle un nombre (ej: `NodeJS_Backend`) y copia el código generado.
   - **Configurar .env**: Pega el código en la variable `HASS_TOKEN`.
   - **Ejecutar**:
     ```bash
     cd services
     npm run mock
     ```

4. **Base de Datos**:
   Para sincronizar el esquema de Drizzle con PostgreSQL:
   ```bash
   cd services
   npm run db:push
   ```

## 🚀 Paso a Producción (Raspberry Pi)

Cuando muevas este proyecto a la Raspberry Pi, considera estos ajustes para un rendimiento óptimo:

1.  **Descubrimiento de Dispositivos (Crucial)**:
    En `docker-compose.yml`, descomenta `# network_mode: host` y comenta la sección `ports` en el servicio `homeassistant`.
    *   *Por qué:* Esto permite que Home Assistant escanee tu red Wi-Fi/LAN para encontrar dispositivos (Google Cast, HomeKit, etc.) automáticamente.

2.  **Conexión Interna (Docker DNS)**:
    Si tu aplicación Node.js corre **dentro** de Docker (contenedor `app`), en el archivo `.env` de la RPi deberías usar:
    ```env
    HASS_URL=http://homeassistant:8123
    ```
    Si corres scripts manualmente desde la terminal de la RPi, `http://localhost:8123` seguirá funcionando.
