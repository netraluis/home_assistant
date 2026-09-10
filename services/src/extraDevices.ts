import type { SensorDef, SensorType } from './sensors';

/**
 * Dispositivos que NO vienen de Zigbee2MQTT.
 *
 * El backend descubre la red Zigbee leyendo `zigbee2mqtt/bridge/devices`, pero
 * hay aparatos que nunca aparecerán ahí porque no son Zigbee — el relé Tuya por
 * WiFi, por ejemplo, que entra a través de `tuya-bridge`. Se declaran a mano en
 * la variable `MQTT_DEVICES` y a partir de ahí el resto del sistema los trata
 * exactamente igual: publican su estado en `mqttTopic` y obedecen en
 * `<mqttTopic>/set`, que es lo único que el backend asume de un dispositivo.
 *
 * Formato (JSON, un array):
 *   [{"entityId":"rele_cuadro","name":"Relé cuadro","type":"toggle",
 *     "mqttTopic":"tuya/rele_cuadro","vendor":"TONGOU","model":"SY2 JWT"}]
 */
export type ExtraDevice = SensorDef & { controllable: boolean };

const TYPES: readonly SensorType[] = ['light', 'toggle', 'slider'];

const ICONS: Record<SensorType, string> = {
  light: '💡',
  toggle: '⚡',
  slider: '📊',
};

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function parseExtraDevices(raw: string | undefined): ExtraDevice[] {
  if (!raw || !raw.trim()) return [];

  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch (e) {
    console.warn('MQTT_DEVICES: no es JSON válido, se ignora:', (e as Error).message);
    return [];
  }
  if (!Array.isArray(list)) {
    console.warn('MQTT_DEVICES: se esperaba un array, se ignora');
    return [];
  }

  const devices: ExtraDevice[] = [];
  const seen = new Set<string>();

  for (const item of list) {
    if (typeof item !== 'object' || item === null) continue;
    const entry = item as Record<string, unknown>;

    const entityId = asText(entry.entityId);
    const mqttTopic = asText(entry.mqttTopic);
    if (!entityId || !mqttTopic) {
      console.warn('MQTT_DEVICES: entrada sin `entityId` o `mqttTopic`, se ignora');
      continue;
    }
    // Un entityId repetido dejaría dos tarjetas peleándose por el mismo estado.
    if (seen.has(entityId)) {
      console.warn(`MQTT_DEVICES: entityId duplicado "${entityId}", se ignora`);
      continue;
    }
    seen.add(entityId);

    const typeText = asText(entry.type);
    const type: SensorType =
      typeText && (TYPES as string[]).includes(typeText) ? (typeText as SensorType) : 'toggle';
    const name = asText(entry.name) ?? entityId;
    const vendor = asText(entry.vendor);
    const model = asText(entry.model);

    devices.push({
      entityId,
      name,
      type,
      icon: asText(entry.icon) ?? ICONS[type],
      mqttTopic,
      attributes: { friendly_name: name },
      // Un `slider` es una lectura; lo demás se puede encender y apagar.
      controllable: typeof entry.controllable === 'boolean' ? entry.controllable : type !== 'slider',
      // exactOptionalPropertyTypes: true → nada de asignar `undefined`.
      ...(vendor ? { vendor } : {}),
      ...(model ? { model } : {}),
    });
  }

  return devices;
}
