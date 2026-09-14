# tuya-bridge

Traductor entre dispositivos **Tuya WiFi** y MQTT.

```
relé Tuya  ──LAN, protocolo Tuya──▶  tuya-bridge  ──MQTT──▶  mosquitto ──▶ backend ──▶ dashboard
```

Es al protocolo de Tuya lo que Zigbee2MQTT es a la radio Zigbee: el aparato no
sabe nada de MQTT, y este proceso habla MQTT **en su nombre**.

---

## Por qué existe

El backend descubre dispositivos leyendo `zigbee2mqtt/bridge/devices`. Ahí solo
salen aparatos **Zigbee**, porque es lo único que el dongle USB puede oír. Un relé
WiFi no aparecerá nunca, por mucho que esté en la misma casa y en la misma red:
son radios distintas y protocolos distintos.

Se podría haber metido el protocolo de Tuya dentro del backend, pero el puente va
aparte a propósito:

- **El backend no aprende protocolos.** Para él un dispositivo es cualquier cosa
  que publique estado en un topic y obedezca en `<topic>/set`. Esa es toda la
  interfaz. Gracias a eso, integrar el relé **no obligó a tocar el control, ni la
  persistencia del consumo, ni la tarjeta del dashboard**.
- **El siguiente cacharro de otra marca es otro puente**, no una rama más de `if`
  dentro del backend.
- Aísla las dependencias: aquí dentro hay Python y `tinytuya`; el backend sigue
  siendo Node puro.

---

## El protocolo de Tuya, lo justo para entender esto

Los aparatos Tuya hablan un protocolo propio por TCP en el puerto **6668**, y se
anuncian por **broadcast UDP** en los puertos 6666/6667/7000. Tres cosas que hay
que saber:

**1. Todo va cifrado con la `local_key`.** Es una clave de 16 caracteres que Tuya
genera al emparejar el aparato y que guarda en su nube. Sin ella el dispositivo
contesta al saludo pero rechaza cualquier consulta. Es lo que verás si te falta:

```
[tuya/lo-que-sea] Check device key or version
```

Ese mensaje es en realidad buena señal: significa que el puente **ha llegado al
aparato**; solo le falta la credencial.

**2. El estado son "DPs" (data points), numerados.** No hay nombres: el aparato
devuelve algo como `{"1": true, "19": 0, "20": 2349}`. Qué significa cada número
es convención de Tuya, no un estándar, y **varía entre modelos**. Por eso el
puente publica también los DPs crudos: son la única forma de saber qué expone de
verdad un aparato concreto.

**3. Hay versiones de protocolo** (3.1, 3.3, 3.4, 3.5) y no son compatibles. Los
aparatos nuevos suelen usar **3.4** o 3.5, que negocian una sesión al conectar. Es
la razón de que esto vaya en Python: `tinytuya` soporta 3.4 y 3.5 con solvencia, y
el soporte en las librerías de Node no es fiable.

---

## Puesta en marcha desde cero

Este es el procedimiento real, en orden.

### 1. El aparato en la wifi

Con la app **Smart Life / Tuya Smart**, como cualquier usuario. Los Tuya son
**solo 2.4 GHz**: si tu router tiene las dos bandas con el mismo nombre, puede que
tengas que separarlas temporalmente para que el emparejamiento funcione.

El aparato tiene que quedar en **la misma red que la Pi**. Si lo pones en la wifi
de invitados o en otra VLAN, el puente no lo verá y no hay forma de arreglarlo
desde aquí.

### 2. Encontrarlo en la LAN

Esto no necesita ninguna clave y confirma que el camino de red funciona:

```bash
docker run --rm --network host python:3.12-slim \
  sh -c 'pip install -q tinytuya && python -m tinytuya scan'
```

Salida esperada:

```
Unknown v3.4 Device   Product ID = xxxxxxxxxxxxxxxx  [Valid Broadcast]:
    Address = 192.168.x.x   Device ID = bfxxxxxxxxxxxxxxxxxxxx  Version = 3.4
    No Stats: DEVICE KEY required to poll for status
```

Apunta el **Device ID** y la **Version**. Que diga `DEVICE KEY required` es lo
normal en este punto.

> `--network host` no es opcional: el descubrimiento va por broadcast UDP y **no
> cruza el bridge de Docker**. Sin eso el escaneo sale vacío aunque el aparato esté
> ahí.

### 3. Sacar la `local_key`

La clave está en la nube de Tuya y solo se puede recuperar con una cuenta de
desarrollador. Es gratis y se hace una vez:

1. **iot.tuya.com** → registrarse. Si pregunta el tipo de cuenta, *Skip this step*.
2. **Cloud → Development → Create Cloud Project**:
   - *Development Method*: **Smart Home** (preselecciona las APIs correctas)
   - *Data Center*: el de tu región (**Central Europe** para España/Andorra)
3. Al crear, autorizar los servicios que vienen marcados. Tienen que estar **IoT
   Core** y **Authorization**.
4. Dentro del proyecto: **Devices → Link Tuya App Account → Add App Account**, con
   *Automatic* y *Read Only Status*. Sale un QR.
5. En la app: **Yo → icono de escanear** (arriba a la derecha) → escanear → confirmar.
6. En **Overview** del proyecto, copiar **Access ID** y **Access Secret**.

Y en la Pi:

```bash
nano ~/.tuya-api.env
```
```
TUYA_API_KEY=<Access ID>
TUYA_API_SECRET=<Access Secret>
TUYA_API_REGION=eu
```
```bash
./scripts/fetch-tuya-key.sh     # en la carpeta del stack, no en este repo
```

El script escribe `tuya-devices.json` con las claves y **no imprime ninguna**:
solo dice qué encontró.

#### Lo que puede salir mal aquí

| Síntoma | Causa |
|---|---|
| La lista de dispositivos sale **vacía** tras vincular la app | **Centro de datos equivocado**. No depende de dónde vives, sino de dónde registró Tuya tu cuenta. No se puede cambiar en un proyecto ya creado: hay que crear otro con otra región (Western Europe suele ser la alternativa) |
| `1106 permission deny` | Falta suscribir **IoT Core** o **Authorization** en *Service API* |
| Funcionaba y dejó de funcionar al mes | La suscripción gratuita a las APIs **caduca al mes**. Se renueva desde el mismo sitio. Ojo: esto solo afecta a *recuperar* claves; el puente sigue funcionando con la que ya tiene |
| El QR no escanea | Extensiones del navegador que cambian colores (Dark Reader y similares) rompen el contraste |

### 4. Configurar y arrancar

`tuya-devices.json`, montado en `/config`:

```json
[
  {
    "name": "Rele cuadro",
    "id": "bfxxxxxxxxxxxxxxxxxxxx",
    "key": "xxxxxxxxxxxxxxxx",
    "version": "3.4",
    "ip": ""
  }
]
```

- `key` — la **local_key**. Sin ella el puente salta el aparato con un aviso.
- `ip` — **déjala vacía**. El puente la busca por broadcast al conectar, así que
  sobrevive a que el router le cambie la IP. Ponerla solo ahorra ese paso.
- `version` — por defecto `3.4`.
- `switch_dp` (opcional) — fuerza el DP del interruptor. Solo hace falta si el
  modelo no usa el `1` ni el `101`.

El fichero **lleva credenciales**: `.gitignore`, permisos 600 y montado como solo
lectura.

### 5. Que el backend lo vea

El puente solo pone mensajes en MQTT. Para que salga en el dashboard hay que
declararlo en `MQTT_DEVICES` del backend:

```
MQTT_DEVICES=[{"entityId":"rele_cuadro","name":"Relé cuadro","type":"toggle",
               "mqttTopic":"tuya/rele_cuadro","vendor":"TONGOU","model":"SY2 JWT"}]
```

El `mqttTopic` tiene que coincidir con el que publica el puente, que sale del
`name` del dispositivo pasado a minúsculas y con guiones bajos. Lo confirmas en el
arranque:

```
· Rele cuadro -> tuya/rele_cuadro (protocolo 3.4)
```

---

## Los DPs: cómo descifrar un modelo nuevo

Cada payload que publica el puente incluye los DPs crudos. Enchufa el aparato,
mira lo que manda y ve atando cabos:

```bash
docker exec ha_mosquitto mosquitto_sub -h localhost -t 'tuya/#' -C 1 -W 20
```

Ejemplo real de un relé con medición, encendido y sin carga:

```json
{"state":"ON","current":0.0,"power":0.0,"voltage":234.9,"energy":0.01,
 "dps":{"1":true,"9":0,"17":1,"18":0,"19":0,"20":2349,"21":1,"22":16021,
        "23":12452,"24":3109,"25":2668,"26":0,"38":"memory","40":"relay",
        "41":false,"42":"","66":"online"}}
```

Se lee así: el `1` es booleano → es el interruptor. El `20` vale 2349 con 234,9 V
reales en el enchufe → viene en décimas de voltio. Los `22`-`25` son constantes de
calibración de fábrica, no lecturas.

Convención habitual en interruptores con medición:

| DP | Qué es | Escalado |
|---|---|---|
| `1` (a veces `101`) | Interruptor | booleano |
| `9` | Temporizador | segundos |
| `17` | Energía acumulada | ÷100 → kWh |
| `18` | Corriente | ÷1000 → A |
| `19` | Potencia | ÷10 → W |
| `20` | Tensión | ÷10 → V |
| `26` | Código de fallo | bitmask |

El mapa está en `METRICS`, en `bridge.py`. Si un modelo nuevo usa otros números, se
edita ahí. El **interruptor no hace falta configurarlo**: el puente busca el primer
DP booleano entre los candidatos habituales y recuerda cuál era para usarlo al
escribir.

Los DPs crudos viajan en cada mensaje a propósito, pero **no ensucian el
histórico**: el backend solo persiste números sueltos con nombre conocido, y `dps`
es un objeto.

---

## Topics

Publica en `tuya/<nombre>` **con la misma forma que Z2M**, que es lo que permite
que el backend no tenga que distinguir de dónde viene un dispositivo:

```json
{"state":"ON","power":42.3,"voltage":230.1,"current":0.184,"energy":1.25,"dps":{…}}
```

Escucha en `tuya/<nombre>/set`:

```json
{"state":"ON"}
```

Al recibir una orden la aplica y **publica el estado nuevo sin esperar al siguiente
sondeo**, para que el interruptor del dashboard no se quede colgado hasta 10
segundos.

---

## Variables de entorno

| Variable | Por defecto | Qué hace |
|---|---|---|
| `TUYA_CONFIG` | `/config/tuya-devices.json` | Ruta del JSON de dispositivos |
| `MQTT_HOST` / `MQTT_PORT` | `mosquitto` / `1883` | Broker. Con `network_mode: host` es `localhost` |
| `TOPIC_PREFIX` | `tuya` | Prefijo de los topics |
| `POLL_SECONDS` | `10` | Cada cuánto se pregunta el estado |
| `RETRY_SECONDS` | `30` | Espera tras un fallo, para no castigar a un aparato apagado |

---

## Decisiones de diseño

**Sondeo, no eventos.** El protocolo local de Tuya no empuja cambios: hay que
preguntar. Si alguien acciona el relé a mano o desde la app, el dashboard tarda
hasta `POLL_SECONDS` en enterarse. Bajarlo mucho castiga al aparato sin ganar gran
cosa.

**Una conexión TCP viva por dispositivo** (`set_socketPersistent`). El protocolo
3.4 negocia una sesión al conectar, así que abrir y cerrar en cada consulta sale
caro. Cuando algo falla se tira la conexión y se reconecta en el siguiente intento,
esperando `RETRY_SECONDS`.

**Un hilo por dispositivo.** Un aparato que no responde bloquea su hilo hasta el
timeout; con un solo bucle, uno apagado congelaría a todos los demás.

**`network_mode: host`.** Obligado por el broadcast UDP del descubrimiento. Es la
razón de que `MQTT_HOST` sea `localhost` y no el nombre del servicio de Docker.

---

## Problemas típicos

| Síntoma | Qué mirar |
|---|---|
| `Check device key or version` de repente, sin haber tocado nada | La **`local_key` cambia al reemparejar el aparato desde la app de Tuya**. Regenerar `tuya-devices.json` y reiniciar el puente |
| `no se alcanza el dispositivo` | El aparato está apagado, fuera de cobertura, o en otra red/VLAN. Confirmar con `tinytuya scan` |
| El puente arranca y no menciona un dispositivo | Le falta `key` en el JSON: se ignora a propósito, con un aviso en el arranque |
| Publica en MQTT pero no sale en el dashboard | Falta declararlo en `MQTT_DEVICES`, o el `mqttTopic` no coincide con el que imprime el puente al arrancar |
| Sale en el dashboard pero sin consumo | El modelo no expone medición, o sus DPs no están en `METRICS`. Mirar el campo `dps` del mensaje |

---

## Añadir otro dispositivo

**Otro Tuya**: emparejarlo en la app, volver a lanzar `fetch-tuya-key.sh` (trae
todos los de la cuenta), reiniciar el puente y declararlo en `MQTT_DEVICES`. Nada
de código.

**Otra marca**: escribir otro puente. El contrato es todo lo que hay que cumplir:

1. Publica el estado en un topic, en JSON, con `state` (`"ON"`/`"OFF"`) y las
   métricas numéricas con los nombres que ya usa el sistema (`power`, `voltage`,
   `current`, `energy`, `temperature`, `humidity`…).
2. Obedece en `<topic>/set` un `{"state":"ON"}`.
3. Declara el dispositivo en `MQTT_DEVICES`.

Con eso, control, histórico y tarjeta del dashboard funcionan solos. El backend no
se entera de qué protocolo hay al otro lado, y ese es exactamente el objetivo.
