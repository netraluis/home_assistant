"""Puente entre dispositivos Tuya WiFi y MQTT.

Los dispositivos Tuya no hablan MQTT: hablan su propio protocolo cifrado por la
LAN. Este proceso hace de intérprete en los dos sentidos, el mismo papel que
Zigbee2MQTT juega para la radio Zigbee:

    relé Tuya  <--LAN, protocolo Tuya-->  este puente  <--MQTT-->  mosquitto

  - Cada POLL_SECONDS pregunta el estado a cada dispositivo y lo publica en
    `<prefijo>/<nombre>` con la misma forma que usa Z2M (`state`, `power`,
    `voltage`, `current`, `energy`), para que el backend lo trate igual que a
    un dispositivo Zigbee sin ningún caso especial.
  - Escucha `<prefijo>/<nombre>/set` y traduce `{"state": "ON"}` a la orden que
    el dispositivo entiende.

Las claves salen de un JSON montado en el container (ver README). La `local_key`
de un dispositivo cambia si se vuelve a emparejar desde la app de Tuya; cuando
eso pasa, el dispositivo deja de responder y hay que regenerar ese fichero.
"""

import json
import os
import re
import signal
import sys
import threading
import time

import paho.mqtt.client as mqtt
import tinytuya

CONFIG_PATH = os.environ.get("TUYA_CONFIG", "/config/tuya-devices.json")
MQTT_HOST = os.environ.get("MQTT_HOST", "mosquitto")
MQTT_PORT = int(os.environ.get("MQTT_PORT", "1883"))
TOPIC_PREFIX = os.environ.get("TOPIC_PREFIX", "tuya")
POLL_SECONDS = float(os.environ.get("POLL_SECONDS", "10"))
# Tras un fallo esperamos más entre intentos, para no castigar a un dispositivo
# que está apagado o fuera de cobertura.
RETRY_SECONDS = float(os.environ.get("RETRY_SECONDS", "30"))

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


def slug(name: str) -> str:
    """Nombre de topic legible y estable a partir del nombre del dispositivo."""
    s = re.sub(r"[^a-z0-9]+", "_", name.strip().lower())
    return s.strip("_") or "dispositivo"


def load_devices() -> list[dict]:
    with open(CONFIG_PATH) as f:
        raw = json.load(f)
    if not isinstance(raw, list):
        raise SystemExit(f"{CONFIG_PATH}: se esperaba una lista de dispositivos")

    devices = []
    for entry in raw:
        if not entry.get("key"):
            # Sin local_key no se le puede hablar; normalmente son dispositivos
            # de la cuenta que no están en esta red.
            print(f"  · {entry.get('name')}: sin local_key, se ignora")
            continue
        entry.setdefault("version", "3.4")
        entry["topic"] = entry.get("topic") or f"{TOPIC_PREFIX}/{slug(entry['name'])}"
        devices.append(entry)
    return devices


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
    def __init__(self, entry: dict, client: mqtt.Client):
        super().__init__(daemon=True, name=entry["topic"])
        self.entry = entry
        self.client = client
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


def main() -> None:
    print(f"tuya-bridge {os.environ.get('COMMIT_SHA', 'dev')}")
    devices_config = load_devices()
    if not devices_config:
        raise SystemExit(f"No hay dispositivos con local_key en {CONFIG_PATH}")

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    devices: dict[str, Device] = {}

    def on_connect(cli, _userdata, _flags, reason_code, _properties=None):
        if reason_code != 0:
            print(f"MQTT rechazó la conexión: {reason_code}")
            return
        print(f"MQTT conectado a {MQTT_HOST}:{MQTT_PORT}")
        for dev in devices.values():
            cli.subscribe(f"{dev.topic}/set")

    def on_message(_cli, _userdata, msg):
        dev = devices.get(msg.topic.removesuffix("/set"))
        if dev is not None:
            dev.on_set(msg.payload)

    client.on_connect = on_connect
    client.on_message = on_message

    for entry in devices_config:
        dev = Device(entry, client)
        devices[dev.topic] = dev
        print(f"  · {entry['name']} -> {dev.topic} (protocolo {entry['version']})")

    def shutdown(*_args):
        stopping.set()
        client.disconnect()

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    client.connect(MQTT_HOST, MQTT_PORT, keepalive=60)
    for dev in devices.values():
        dev.start()

    client.loop_forever()
    stopping.set()
    sys.exit(0)


if __name__ == "__main__":
    main()
