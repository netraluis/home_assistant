# AGENT Context: Nodo Home Assistant (Root)

## Contexto
Este directorio es la raíz del proyecto de domótica "Home Assistant Node". Actúa como el orquestador de infraestructura utilizando Docker Compose. Su objetivo es desplegar un entorno replicable tanto en macOS (desarrollo) como en Raspberry Pi (producción).

## Distribución de Carpetas

- **`/` (Root)**: Contiene la configuración de infraestructura (`docker-compose.yml`) y variables de entorno.
- **`services/`**: Contiene la lógica de negocio personalizada (Node.js + Drizzle ORM) y scripts de simulación.
- **`web/`**: Frontend Next.js (única cara pública). La UI se construye con los componentes de
  shadcn/ui que viven en `web/components/ui/`.
- **`packages/shared/`**: Tipos TypeScript compartidos entre backend y frontend (`@home/shared`).
- **`data/`**: Directorio destinado a volúmenes persistentes de Docker (Postgres, Mosquitto y la
  configuración y base de datos de Zigbee2MQTT). *Este directorio está ignorado en git.*

## Cómo Arrancar esta Parcela (Infraestructura)

1.  **Requisitos**: Docker y Docker Compose instalados.
2.  **Configuración**: Asegurarse de que existe el archivo `.env` (basado en `.env.example`).
3.  **Ejecución**:
    ```bash
    # Levantar todos los servicios en segundo plano
    docker-compose up -d

    # Ver logs de todos los servicios
    docker-compose logs -f

    # Detener servicios
    docker-compose down
    ```

## Notas Técnicas
- El esquema de PostgreSQL se versiona con migraciones Drizzle en `services/drizzle/`, y el backend las aplica al arrancar: un despliegue nuevo crea sus propias tablas sin pasos manuales.
- El archivo `docker-compose.yml` utiliza rutas relativas (`./data/...`) para los volúmenes, facilitando la portabilidad.
- La red **no** usa `host`: hay dos redes declaradas en el compose. `default` es interna y por
  ella hablan `web` → `app` → `postgres`/`mosquitto`; `lab` es externa y sirve para que
  `cloudflared` alcance **solo** a `home_assistant_web`. El backend y la base de datos no son
  alcanzables desde fuera. (La variable `DOCKER_NETWORK_MODE` del `.env` es un resto de una
  versión anterior y ya no la lee nadie.)
- Zigbee no necesita mDNS ni descubrimiento de red: entra por el dongle USB mapeado en el
  servicio `zigbee2mqtt`.
