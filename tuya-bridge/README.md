# tuya-bridge

Traductor entre dispositivos **Tuya WiFi** y MQTT. Es al protocolo de Tuya lo que
Zigbee2MQTT es a la radio Zigbee:

```
relé Tuya  ──LAN, protocolo Tuya──▶  tuya-bridge  ──MQTT──▶  mosquitto ──▶ backend
```

El backend no sabe que existe: para él es un dispositivo más que publica su estado
en un topic y obedece en `<topic>/set`. Por eso encender, apagar y el histórico de
consumo funcionan sin ningún caso especial.

Va en Python porque el protocolo lo habla `tinytuya`. El soporte de la **versión
3.4** del protocolo en las librerías de Node no es fiable, y los aparatos nuevos
la usan.

## Configuración

Necesita un `tuya-devices.json` montado en `/config`:

```json
[
  {
    "name": "Rele cuadro",
    "id": "bfxxxxxxxxxxxxxxxxxxxx",
    "key": "xxxxxxxxxxxxxxxx",
    "version": "3.4",
    "ip": "192.168.100.18"
  }
]
```

- `key` es la **local_key** del aparato. Sin ella el dispositivo contesta pero
  cifrado, y el puente la salta con un aviso.
- `ip` puede ir vacía: el puente la busca por broadcast, que además confirma que
  el aparato está vivo. Ponerla ahorra ese descubrimiento.
- `version` por defecto `3.4`.
- `switch_dp` (opcional) fuerza el DP del interruptor. Solo hace falta si el
  modelo no usa el `1` ni el `101`.

Ese fichero **lleva credenciales**: está en `.gitignore` y se monta como solo
lectura. Se genera con `scripts/fetch-tuya-key.sh` (fuera de este repo, en la
carpeta del stack), que consulta la cuenta de Tuya IoT y escribe las claves.

> La `local_key` **cambia si vuelves a emparejar el aparato desde la app de Tuya**.
> Si un día el puente empieza a decir `Check device key or version` sin que hayas
> tocado nada, es eso: regenera el fichero.

## Variables de entorno

| Variable | Por defecto | Qué hace |
|---|---|---|
| `TUYA_CONFIG` | `/config/tuya-devices.json` | Ruta del JSON de dispositivos |
| `MQTT_HOST` / `MQTT_PORT` | `mosquitto` / `1883` | Broker |
| `TOPIC_PREFIX` | `tuya` | Prefijo de los topics |
| `POLL_SECONDS` | `10` | Cada cuánto se pregunta el estado |
| `RETRY_SECONDS` | `30` | Espera tras un fallo, para no castigar a un aparato apagado |

## Topics

Publica en `tuya/<nombre>` con la misma forma que Z2M, para que el backend no
tenga que distinguir:

```json
{"state":"ON","power":42.3,"voltage":230.1,"current":0.184,"energy":1.25,
 "dps":{"1":true,"19":423,"20":2301}}
```

Los `dps` crudos viajan también porque son la única forma de ver qué expone de
verdad un modelo concreto; el backend solo persiste números sueltos, así que no
ensucian el histórico.

Escucha en `tuya/<nombre>/set`:

```json
{"state":"ON"}
```

## Red

Corre con `network_mode: host`. El descubrimiento de Tuya va por **broadcast UDP**
en la LAN y no cruza el bridge de Docker: sin `host` el puente no encuentra nada.

## Que el backend lo vea

El puente solo pone los mensajes en MQTT. Para que el dispositivo salga en el
dashboard hay que declararlo en `MQTT_DEVICES` del backend:

```
MQTT_DEVICES=[{"entityId":"rele_cuadro","name":"Relé cuadro","type":"toggle","mqttTopic":"tuya/rele_cuadro","vendor":"TONGOU","model":"SY2 JWT"}]
```
