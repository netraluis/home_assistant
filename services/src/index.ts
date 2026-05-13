import express from 'express';
import cors from 'cors';
import mqtt from 'mqtt';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, desc } from 'drizzle-orm';
import * as dotenv from 'dotenv';
import path from 'path';
import { sensorData } from './db/schema';
import { SENSORS } from './sensors';
import type { SensorDef, SensorRange, SensorType } from './sensors';

dotenv.config({ path: '../.env' });

const PORT = process.env.PORT || 3000;
const MQTT_HOST = process.env.MQTT_HOST || 'localhost';
const MQTT_PORT = process.env.MQTT_PORT || '1883';
const MQTT_USER = process.env.MQTT_USER;
const MQTT_PASSWORD = process.env.MQTT_PASSWORD;
const DATABASE_URL = process.env.DATABASE_URL;

// --- In-memory sensor state (key = entityId) ---
interface SensorState {
  state: string;
  attributes: Record<string, any>;
  lastSeen: Date;
}
const sensorStates = new Map<string, SensorState>();

// --- Zigbee2MQTT discovery (key = friendly_name) ---
// Z2M publica este JSON RETENIDO en zigbee2mqtt/bridge/devices al iniciar y
// cada vez que cambia la red (parejado/borrado). Lo parseamos para construir
// dinámicamente la lista real de sensores.
interface Z2MExpose {
  type?: string;          // 'light' | 'switch' | 'binary' | 'numeric' | 'enum' | 'composite' | ...
  name?: string;          // 'state' | 'brightness' | 'temperature' | ...
  access?: number;        // bitmask: 1=published, 2=set, 4=get
  unit?: string;
  value_min?: number;
  value_max?: number;
  features?: Z2MExpose[];
}
interface Z2MDevice {
  ieee_address: string;
  friendly_name: string;
  type?: string;          // 'EndDevice' | 'Router' | 'Coordinator' | ...
  supported?: boolean;
  definition?: {
    vendor?: string;
    model?: string;
    description?: string;
    exposes?: Z2MExpose[];
  };
}
const discoveredDevices = new Map<string, Z2MDevice>();
let discoverySource: 'zigbee2mqtt' | 'mock' | 'none' = 'none';
let discoveryLastUpdate: Date | null = null;

// --- Helpers para inferir tipo / icono / rango desde Z2M exposes ---
function flattenExposes(exposes: Z2MExpose[] | undefined): Z2MExpose[] {
  const out: Z2MExpose[] = [];
  const visit = (e: Z2MExpose | undefined) => {
    if (!e) return;
    if (Array.isArray(e.features)) e.features.forEach(visit);
    out.push(e);
  };
  (exposes ?? []).forEach(visit);
  return out;
}

const NUMERIC_SENSOR_NAMES = new Set([
  'temperature', 'humidity', 'pressure', 'illuminance',
  'power', 'energy', 'voltage', 'current',
]);

function inferType(exposes: Z2MExpose[] | undefined): SensorType {
  const flat = flattenExposes(exposes);
  if (flat.some(e => e.type === 'light')) return 'light';
  if (flat.some(e => e.type === 'switch')) return 'toggle';
  const numeric = flat.find(e => e.type === 'numeric' && NUMERIC_SENSOR_NAMES.has(e.name ?? ''));
  if (numeric) return 'slider';
  if (flat.some(e => e.type === 'binary')) return 'toggle';
  if (flat.some(e => e.type === 'numeric')) return 'slider';
  return 'toggle';
}

function isControllable(exposes: Z2MExpose[] | undefined): boolean {
  return flattenExposes(exposes).some(e => ((e.access ?? 0) & 2) !== 0);
}

function iconFor(type: SensorType, exposes: Z2MExpose[] | undefined): string {
  const names = new Set(flattenExposes(exposes).map(e => e.name).filter(Boolean));
  if (type === 'light') return '💡';
  if (names.has('temperature')) return '🌡️';
  if (names.has('humidity')) return '💦';
  if (names.has('power') || names.has('energy')) return '⚡';
  if (names.has('occupancy') || names.has('presence')) return '🧍';
  if (names.has('contact')) return '🚪';
  if (names.has('water_leak')) return '💧';
  if (names.has('vibration')) return '📳';
  if (names.has('smoke')) return '🔥';
  return type === 'toggle' ? '🔌' : '📡';
}

function rangeFor(type: SensorType, exposes: Z2MExpose[] | undefined): SensorRange | undefined {
  const flat = flattenExposes(exposes);
  if (type === 'light') {
    const b = flat.find(e => e.name === 'brightness');
    if (b) return { min: b.value_min ?? 0, max: b.value_max ?? 254, step: 1, unit: 'brightness' };
  }
  if (type === 'slider') {
    const n = flat.find(e => e.type === 'numeric' && NUMERIC_SENSOR_NAMES.has(e.name ?? ''));
    if (n) return { min: n.value_min ?? 0, max: n.value_max ?? 100, step: 1, unit: n.unit ?? '' };
  }
  return undefined;
}

// --- Vista unificada: union de Z2M descubierto + overrides estáticos (SENSORS) ---
type SensorMeta = SensorDef & { paired: boolean; controllable: boolean };

function buildMetaFromZ2M(z2m: Z2MDevice): SensorMeta {
  const exposes = z2m.definition?.exposes;
  const type = inferType(exposes);
  const override = SENSORS.find(s => s.mqttTopic === `zigbee2mqtt/${z2m.friendly_name}`);
  const range = rangeFor(type, exposes);
  const base: SensorDef = override ?? {
    entityId: z2m.friendly_name,
    name: z2m.friendly_name,
    type,
    icon: iconFor(type, exposes),
    mqttTopic: `zigbee2mqtt/${z2m.friendly_name}`,
    attributes: { friendly_name: z2m.friendly_name },
    ...(range ? { range } : {}),
  };
  // exactOptionalPropertyTypes: true → no podemos asignar `undefined` a opcionales.
  return {
    ...base,
    ...(z2m.definition?.vendor ? { vendor: z2m.definition.vendor } : {}),
    ...(z2m.definition?.model ? { model: z2m.definition.model } : {}),
    ieeeAddress: z2m.ieee_address,
    paired: true,
    controllable: isControllable(exposes),
  };
}

function getAllSensors(): SensorMeta[] {
  if (discoverySource === 'zigbee2mqtt') {
    return Array.from(discoveredDevices.values()).map(buildMetaFromZ2M);
  }
  // Sin Z2M aún → fallback al SENSORS estático (útil para `npm run mock`).
  return SENSORS.map(s => ({
    ...s,
    paired: false,
    controllable: s.type === 'light' || s.type === 'toggle',
  }));
}

function findSensor(entityId: string): SensorMeta | undefined {
  return getAllSensors().find(s => s.entityId === entityId);
}

// --- PostgreSQL + Drizzle ---
const pool = new Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool);

// --- MQTT ---
const mqttOptions: mqtt.IClientOptions = {};
if (MQTT_USER) mqttOptions.username = MQTT_USER;
if (MQTT_PASSWORD) mqttOptions.password = MQTT_PASSWORD;
const mqttClient = mqtt.connect(`mqtt://${MQTT_HOST}:${MQTT_PORT}`, mqttOptions);

let mqttConnected = false;
let lastMqttMessage: Date | null = null;
let mqttMessageCount = 0;

mqttClient.on('connect', () => {
  mqttConnected = true;
  console.log('MQTT conectado');
  mqttClient.subscribe('zigbee2mqtt/#');
  // Si tras 5s no hemos recibido bridge/devices (Z2M no está) → modo mock.
  setTimeout(() => {
    if (discoverySource === 'none') {
      discoverySource = 'mock';
      console.log('Z2M no responde → modo mock (SENSORS estáticos)');
    }
  }, 5000);
});

mqttClient.on('close', () => { mqttConnected = false; });
mqttClient.on('offline', () => { mqttConnected = false; });

mqttClient.on('message', async (topic, message) => {
  // 1) Inventario real de Z2M (mensaje retenido) → actualizar discovery.
  if (topic === 'zigbee2mqtt/bridge/devices') {
    try {
      const list: Z2MDevice[] = JSON.parse(message.toString());
      discoveredDevices.clear();
      for (const d of list) {
        if (d.type === 'Coordinator' || !d.friendly_name) continue;
        discoveredDevices.set(d.friendly_name, d);
      }
      discoverySource = 'zigbee2mqtt';
      discoveryLastUpdate = new Date();
      console.log(`Z2M devices: ${discoveredDevices.size} descubiertos`);
    } catch (e) {
      console.warn('bridge/devices: JSON parse failed', e);
    }
    return;
  }
  // Resto de mensajes de bridge/* (info, state, logging, ...) los ignoramos.
  if (topic.startsWith('zigbee2mqtt/bridge')) return;

  // 2) Mensaje de estado de un device. Resolvemos meta desde Z2M descubierto
  //    o desde el SENSORS estático (modo mock).
  const friendlyName = topic.replace(/^zigbee2mqtt\//, '');
  const z2m = discoveredDevices.get(friendlyName);
  let sensor: SensorMeta | undefined;
  if (z2m) {
    sensor = buildMetaFromZ2M(z2m);
  } else {
    const staticDef = SENSORS.find(s => s.mqttTopic === topic);
    if (staticDef) {
      sensor = {
        ...staticDef,
        paired: false,
        controllable: staticDef.type === 'light' || staticDef.type === 'toggle',
      };
      // Llegó un mensaje real para un sensor estático: claramente estamos en modo mock.
      if (discoverySource === 'none') discoverySource = 'mock';
    }
  }
  if (!sensor) return;

  try {
    const payload = JSON.parse(message.toString());

    // Determine state and value based on sensor type
    let state: string;
    let value: number | null = null;
    let unit: string | null = null;

    if (sensor.type === 'light') {
      state = payload.state?.toLowerCase() || 'off';
      value = payload.brightness ?? null;
      unit = 'brightness';
    } else if (sensor.type === 'toggle') {
      const raw = payload.state ?? payload.contact ?? payload.occupancy ?? payload.water_leak;
      if (typeof raw === 'boolean') {
        state = raw ? 'on' : 'off';
      } else {
        state = String(raw).toLowerCase();
      }
    } else {
      // slider: tomar el primer numérico relevante del payload
      value =
        payload.temperature ??
        payload.humidity ??
        payload.power ??
        payload.energy ??
        payload.value ??
        null;
      unit = sensor.range?.unit ?? null;
      state = value !== null ? String(value) : 'unknown';
    }

    // Update MQTT stats
    lastMqttMessage = new Date();
    mqttMessageCount++;

    // Update in-memory state
    sensorStates.set(sensor.entityId, {
      state,
      attributes: { ...sensor.attributes, ...payload },
      lastSeen: new Date(),
    });

    // Save to PostgreSQL
    if (DATABASE_URL) {
      await db.insert(sensorData).values({
        sensorId: sensor.entityId,
        type: sensor.type,
        value,
        unit,
      });
    }
  } catch {
    // Ignore non-JSON messages (e.g. availability: online/offline)
  }
});

// --- Express ---
const app = express();
// CORS_ORIGIN: lista separada por comas; vacío = permitir cualquier origen (dev).
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : true;
app.use(cors({ origin: corsOrigin }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// MQTT + discovery status
app.get('/api/status', (_req, res) => {
  res.json({
    mqtt: {
      connected: mqttConnected,
      host: `${MQTT_HOST}:${MQTT_PORT}`,
      lastMessage: lastMqttMessage,
      messageCount: mqttMessageCount,
    },
    discovery: {
      source: discoverySource,
      deviceCount:
        discoverySource === 'zigbee2mqtt'
          ? discoveredDevices.size
          : discoverySource === 'mock'
            ? SENSORS.length
            : 0,
      lastUpdate: discoveryLastUpdate,
    },
    uptime: process.uptime(),
  });
});

// List all sensors (descubiertos por Z2M o fallback estático) con su estado actual
app.get('/api/sensors', (_req, res) => {
  const result = getAllSensors().map(s => ({
    ...s,
    currentState: sensorStates.get(s.entityId) || null,
  }));
  res.json(result);
});

// Get current state of a sensor
app.get('/api/sensor/:entityId', (req, res) => {
  const state = sensorStates.get(req.params.entityId);
  if (!state) {
    res.json({ state: 'unknown', attributes: {} });
    return;
  }
  res.json(state);
});

// Control a device via MQTT
app.post('/api/sensor/:entityId', (req, res) => {
  const sensor = findSensor(req.params.entityId);
  if (!sensor) {
    res.status(404).json({ error: 'Sensor not found' });
    return;
  }
  if (!sensor.controllable) {
    res.status(400).json({ error: 'Sensor is read-only' });
    return;
  }

  const { state, attributes } = req.body;
  const setTopic = `${sensor.mqttTopic}/set`;
  let payload: Record<string, any> = {};

  if (sensor.type === 'light') {
    payload.state = state?.toUpperCase() || 'OFF';
    if (attributes?.brightness !== undefined) {
      payload.brightness = attributes.brightness;
    }
  } else if (sensor.type === 'toggle') {
    payload.state = state?.toUpperCase() || 'OFF';
  } else {
    payload.value = parseFloat(state);
  }

  mqttClient.publish(setTopic, JSON.stringify(payload));

  // Update in-memory state immediately for UI responsiveness
  sensorStates.set(sensor.entityId, {
    state: String(state),
    attributes: { ...sensor.attributes, ...attributes },
    lastSeen: new Date(),
  });

  res.json({ ok: true, topic: setTopic, payload });
});

// Get history for a sensor
app.get('/api/history/:entityId', async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(sensorData)
      .where(eq(sensorData.sensorId, req.params.entityId))
      .orderBy(desc(sensorData.timestamp))
      .limit(100);
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend: http://localhost:${PORT}`);
  console.log(`MQTT: ${MQTT_HOST}:${MQTT_PORT}`);
});
