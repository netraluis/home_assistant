# AGENT Context: Nodo Home Assistant (Root)

## Contexto
Este directorio es la raíz del proyecto de domótica "Home Assistant Node". Actúa como el orquestador de infraestructura utilizando Docker Compose. Su objetivo es desplegar un entorno replicable tanto en macOS (desarrollo) como en Raspberry Pi (producción).

## Distribución de Carpetas

- **`/` (Root)**: Contiene la configuración de infraestructura (`docker-compose.yml`) y variables de entorno.
- **`services/`**: Contiene la lógica de negocio personalizada (Node.js + Drizzle ORM) y scripts de simulación.
- **`data/`**: Directorio destinado a volúmenes persistentes de Docker (Base de datos, configuración de HA, Mosquitto). *Este directorio está ignorado en git.*

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
- El archivo `docker-compose.yml` utiliza rutas relativas (`./data/...`) para los volúmenes, facilitando la portabilidad.
- La configuración de red es dinámica vía variables de entorno (`DOCKER_NETWORK_MODE`): usa `bridge` en macOS para desarrollo y debe cambiarse a `host` en Raspberry Pi para permitir el descubrimiento de dispositivos (mDNS/UPnP).
