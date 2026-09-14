"""Puente entre dispositivos Tuya WiFi y MQTT.

Los dispositivos Tuya no hablan MQTT: hablan su propio protocolo cifrado por la
LAN. Este proceso hace de intérprete en los dos sentidos, el mismo papel que
Zigbee2MQTT juega para la radio Zigbee:

    relé Tuya  <--LAN, protocolo Tuya-->  este puente  <--MQTT-->  mosquitto

Por cada dispositivo:
  - Cada POLL_SECONDS pregunta el estado y lo publica en `<prefijo>/<nombre>`
    con la misma forma que usa Z2M (`state`, `power`, `voltage`, `current`,
    `energy`), para que el backend lo trate igual que a un Zigbee.
  - Escucha `<prefijo>/<nombre>/set` y traduce `{"state": "ON"}`.

Y como puente, imitando los topics de control de Z2M:
  - Publica su inventario en `<prefijo>/bridge/devices` (retenido).
  - Escucha `<prefijo>/bridge/request/refresh`: vuelve a preguntarle a la nube
    de Tuya qué dispositivos hay en la cuenta, incorpora los nuevos EN CALIENTE
    y contesta en `<prefijo>/bridge/response/refresh`.

Eso último es lo que permite dar de alta un aparato desde el dashboard sin
redesplegar nada: emparejarlo en la app de Tuya y pulsar "buscar".

Las `local_key` se guardan en el JSON de configuración. Cambian si se reempareja
el aparato desde la app; el refresh las vuelve a traer.
"""

import json
import os
import re
import signal
import sys
import threading

import paho.mqtt.client as mqtt
import tinytuya

# Ojo: tiene que estar dentro de un DIRECTORIO montado, no ser el punto de
# montaje. `save_config` reemplaza el fichero de forma atómica y `os.replace`
# falla si el propio fichero es un bind-mount de Docker.
CONFIG_PATH = os.environ.get("TUYA_CONFIG", "/config/devices.json")
MQTT_HOST = os.environ.get("MQTT_HOST", "mosquitto")
MQTT_PORT = int(os.environ.get("MQTT_PORT", "1883"))
TOPIC_PREFIX = os.environ.get("TOPIC_PREFIX", "tuya")
POLL_SECONDS = float(os.environ.get("POLL_SECONDS", "10"))
# Tras un fallo esperamos más entre intentos, para no castigar a un dispositivo
# que está apagado o fuera de cobertura.
RETRY_SECONDS = float(os.environ.get("RETRY_SECONDS", "30"))

BRIDGE_DEVICES = f"{TOPIC_PREFIX}/bridge/devices"
BRIDGE_REFRESH = f"{TOPIC_PREFIX}/bridge/request/refresh"
BRIDGE_REFRESH_RESPONSE = f"{TOPIC_PREFIX}/bridge/response/refresh"

# DPs ("data points") de un interruptor Tuya con medición. Los números son
# convención de Tuya, no un estándar: algunos aparatos mueven el interruptor al
# 101. Por eso el interruptor se busca entre varios candidatos y se puede fijar
# a mano con `switch_dp` en la configuración.
SWITCH_DPS = ("1", "101", "switch", "switch_1")
# Los contadores vienen escalados en enteros; el divisor los pasa a la unidad
# real, la misma que declara Z2M para el enchufe Zigbee.
METRICS = {
    "18": ("current", 1000.0),  # mA    -> A
    "19": ("power", 10.0),      # 0,1 W -> W
    "20": ("voltage", 10.0),    # 0,1 V -> V
    "17": ("energy", 100.0),    # 0,01 kWh -> kWh
}

stopping = threading.Event()
devices: dict[str, "Device"] = {}
devices_lock = threading.Lock()
client: mqtt.Client | None = None


def slug(name: str) -> str:
    """Nombre de topic legible y estable a partir del nombre del dispositivo."""
    s = re.sub(r"[^a-z0-9]+", "_", name.strip().lower())
    return s.strip("_") or "dispositivo"


def normalize(entry: dict) -> dict:
    entry.setdefault("version", "3.4")
    entry["name"] = entry.get("name") or entry["id"]
    entry["topic"] = entry.get("topic") or f"{TOPIC_PREFIX}/{slug(entry['name'])}"
    return entry


def load_config() -> list[dict]:
    try:
        with open(CONFIG_PATH) as f:
            raw = json.load(f)
    except FileNotFoundError:
        return []
    if not isinstance(raw, list):
        raise SystemExit(f"{CONFIG_PATH}: se esperaba una lista de dispositivos")
    return [normalize(e) for e in raw if isinstance(e, dict) and e.get("id")]


def save_config(entries: list[dict]) -> None:
    """Escritura atómica: un corte a media escritura dejaría el fichero de
    claves corrupto y el puente no arrancaría."""
    tmp = f"{CONFIG_PATH}.tmp"
    with open(tmp, "w") as f:
        json.dump(entries, f, indent=2)
    os.replace(tmp, CONFIG_PATH)
    os.chmod(CONFIG_PATH, 0o600)


def resolve_ip(entry: dict) -> str | None:
    """La IP del listado de la nube suele venir vacía o ser la pública: la de la
    LAN se busca por broadcast, que además confirma que el aparato está vivo."""
    ip = entry.get("ip") or ""
    if ip and not ip.startswith("http"):
        return ip
    found = tinytuya.find_device(dev_id=entry["id"])
    return found.get("ip") if found else None


def connect(entry: dict) -> tinytuya.OutletDevice | None:
    ip = resolve_ip(entry)
    if not ip:
        return None
    dev = tinytuya.OutletDevice(entry["id"], ip, entry["key"])
    dev.set_version(float(entry["version"]))
    # Una sola conexión TCP viva en vez de abrir y cerrar en cada consulta: el
    # protocolo 3.4 negocia una sesión al conectar y reconectar cuesta caro.
    dev.set_socketPersistent(True)
    return dev


def translate(dps: dict) -> dict:
    """DPs crudos -> payload con la misma forma que publica Zigbee2MQTT."""
    payload: dict = {}
    for dp, (name, divisor) in METRICS.items():
        value = dps.get(dp)
        if isinstance(value, (int, float)):
            payload[name] = round(value / divisor, 3)
    # Los DPs crudos viajan también: son la única forma de ver qué expone de
    # verdad un modelo concreto. El backend solo persiste números sueltos, así
    # que este objeto no ensucia el histórico.
    payload["dps"] = dps
    return payload


class Device(threading.Thread):
    def __init__(self, entry: dict, mqtt_client: mqtt.Client):
        super().__init__(daemon=True, name=entry["topic"])
        self.entry = entry
        self.client = mqtt_client
        self.topic = entry["topic"]
        self.dev: tinytuya.OutletDevice | None = None
        self.switch_dp: str | None = entry.get("switch_dp")
        self.lock = threading.Lock()

    # --- lectura ---

    def poll(self) -> dict | None:
        with self.lock:
            if self.dev is None:
                self.dev = connect(self.entry)
                if self.dev is None:
                    return None
            status = self.dev.status()

        if not isinstance(status, dict) or "dps" not in status:
            # tinytuya devuelve {'Error': ...} cuando la clave no vale o el
            # aparato no contesta. Tirar la conexión fuerza reconectar.
            with self.lock:
                self.dev = None
            error = (status or {}).get("Error", "sin respuesta")
            print(f"[{self.topic}] {error}")
            return None
        return status["dps"]

    def publish(self, dps: dict) -> None:
        payload = translate(dps)
        if self.switch_dp is None:
            self.switch_dp = next(
                (dp for dp in SWITCH_DPS if isinstance(dps.get(dp), bool)), None
            )
        if self.switch_dp is not None and isinstance(dps.get(self.switch_dp), bool):
            payload["state"] = "ON" if dps[self.switch_dp] else "OFF"
        self.client.publish(self.topic, json.dumps(payload))

    def run(self) -> None:
        while not stopping.is_set():
            dps = self.poll()
            if dps is not None:
                self.publish(dps)
            stopping.wait(POLL_SECONDS if dps is not None else RETRY_SECONDS)

    # --- escritura ---

    def on_set(self, raw: bytes) -> None:
        try:
            command = json.loads(raw)
        except json.JSONDecodeError:
            print(f"[{self.topic}/set] payload no es JSON")
            return

        state = command.get("state")
        if not isinstance(state, str):
            print(f"[{self.topic}/set] sin campo `state`")
            return
        want_on = state.upper() == "ON"

        with self.lock:
            if self.dev is None:
                self.dev = connect(self.entry)
            if self.dev is None:
                print(f"[{self.topic}/set] no se alcanza el dispositivo")
                return
            dp = self.switch_dp or SWITCH_DPS[0]
            result = self.dev.set_value(dp, want_on)

        if isinstance(result, dict) and result.get("Error"):
            print(f"[{self.topic}/set] {result['Error']}")
            with self.lock:
                self.dev = None
            return
        # Publicamos el estado nuevo sin esperar al siguiente sondeo, para que
        # el interruptor del dashboard no se quede colgado hasta 10 segundos.
        dps = self.poll()
        if dps is not None:
            self.publish(dps)


# --- inventario y alta en caliente ---


def start_device(entry: dict) -> None:
    """Da de alta un dispositivo sin reiniciar el puente."""
    assert client is not None
    device = Device(entry, client)
    devices[device.topic] = device
    client.subscribe(f"{device.topic}/set")
    device.start()
    print(f"  · {entry['name']} -> {device.topic} (protocolo {entry['version']})")


def publish_inventory() -> None:
    """Lo que el puente sabe manejar, para que el dashboard pueda ofrecerlo.

    Retenido a propósito: el backend puede conectarse después que nosotros y
    debe ver el inventario igualmente, sin tener que pedir un refresh.
    """
    assert client is not None
    with devices_lock:
        entries = [d.entry for d in devices.values()]
    inventory = [
        {
            "id": e["id"],
            "name": e["name"],
            "topic": e["topic"],
            "hasKey": bool(e.get("key")),
        }
        for e in entries
    ]
    client.publish(BRIDGE_DEVICES, json.dumps(inventory), retain=True)


def refresh_from_cloud() -> str | None:
    """Vuelve a pedirle a Tuya la lista de la cuenta. Devuelve un error legible,
    o None si fue bien. Trae también las `local_key` nuevas de los aparatos que
    se hayan reemparejado desde la app."""
    api_key = os.environ.get("TUYA_API_KEY", "").strip()
    api_secret = os.environ.get("TUYA_API_SECRET", "").strip()
    if not api_key or not api_secret:
        return (
            "El puente no tiene credenciales de la nube de Tuya "
            "(TUYA_API_KEY / TUYA_API_SECRET)"
        )

    try:
        cloud = tinytuya.Cloud(
            apiRegion=os.environ.get("TUYA_API_REGION", "eu").strip(),
            apiKey=api_key,
            apiSecret=api_secret,
        )
        found = cloud.getdevices()
    except Exception as e:  # la librería lanza de todo: red, JSON, auth...
        return f"No se pudo consultar la nube de Tuya: {e}"

    if isinstance(found, dict) and found.get("Error"):
        return f"Tuya respondió {found.get('Err')}: {found.get('Error')}"
    if not found:
        return "La cuenta de Tuya no devuelve ningún dispositivo (¿región equivocada?)"

    with devices_lock:
        by_id = {d.entry["id"]: d.entry for d in devices.values()}
        entries: list[dict] = list(by_id.values())
        nuevos = 0
        for d in found:
            dev_id = d.get("id")
            if not dev_id:
                continue
            if dev_id in by_id:
                # Ya lo teníamos: solo refrescamos la clave, que es lo que
                # cambia al reemparejar. El topic no se toca nunca — moverlo
                # dejaría el histórico colgado del nombre viejo.
                if d.get("key"):
                    by_id[dev_id]["key"] = d["key"]
                continue
            entry = normalize(
                {
                    "name": d.get("name") or dev_id,
                    "id": dev_id,
                    "key": d.get("key", ""),
                    "version": str(d.get("version") or "3.4"),
                    "ip": "",
                }
            )
            entries.append(entry)
            if entry.get("key"):
                start_device(entry)
                nuevos += 1

        try:
            save_config(entries)
        except OSError as e:
            # Los dispositivos nuevos ya están funcionando en memoria; lo que se
            # pierde es que sobrevivan a un reinicio. Mejor avisar que morir.
            print(f"No se pudo guardar {CONFIG_PATH}: {e}")
            publish_inventory()
            return f"Dispositivos añadidos, pero no se pudo guardar la configuración: {e}"

    print(f"Refresh de la nube: {len(found)} en la cuenta, {nuevos} nuevo(s)")
    publish_inventory()
    return None


def main() -> None:
    global client
    print(f"tuya-bridge {os.environ.get('COMMIT_SHA', 'dev')}")

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)

    def on_connect(cli, _userdata, _flags, reason_code, _properties=None):
        if reason_code != 0:
            print(f"MQTT rechazó la conexión: {reason_code}")
            return
        print(f"MQTT conectado a {MQTT_HOST}:{MQTT_PORT}")
        cli.subscribe(BRIDGE_REFRESH)
        with devices_lock:
            topics = [d.topic for d in devices.values()]
        for topic in topics:
            cli.subscribe(f"{topic}/set")
        publish_inventory()

    def on_message(_cli, _userdata, msg):
        # Una excepción aquí dentro se lleva el bucle de MQTT y con él el
        # puente entero. Nada de lo que llegue por la red merece eso.
        try:
            if msg.topic == BRIDGE_REFRESH:
                error = refresh_from_cloud()
                assert client is not None
                client.publish(
                    BRIDGE_REFRESH_RESPONSE,
                    json.dumps({"ok": error is None, "error": error}),
                )
                return
            device = devices.get(msg.topic.removesuffix("/set"))
            if device is not None:
                device.on_set(msg.payload)
        except Exception as e:
            print(f"[{msg.topic}] error tratando el mensaje: {e}")
            if msg.topic == BRIDGE_REFRESH and client is not None:
                client.publish(
                    BRIDGE_REFRESH_RESPONSE, json.dumps({"ok": False, "error": str(e)})
                )

    client.on_connect = on_connect
    client.on_message = on_message

    with devices_lock:
        for entry in load_config():
            if not entry.get("key"):
                # Sin local_key no se le puede hablar. No es un error: el
                # refresh puede traerla más tarde.
                print(f"  · {entry['name']}: sin local_key, se ignora")
                continue
            start_device(entry)

    if not devices:
        print(f"Ningún dispositivo con local_key en {CONFIG_PATH}.")
        print("El puente arranca igual: un refresh desde el dashboard puede traerlos.")

    def shutdown(*_args):
        stopping.set()
        if client is not None:
            client.disconnect()

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    client.connect(MQTT_HOST, MQTT_PORT, keepalive=60)
    client.loop_forever()
    stopping.set()
    sys.exit(0)


if __name__ == "__main__":
    main()
