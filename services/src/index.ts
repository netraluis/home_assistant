import express from 'express';
import cors from 'cors';
import mqtt from 'mqtt';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { and, eq, desc } from 'drizzle-orm';
import * as dotenv from 'dotenv';
import path from 'path';
import { sensorData, deviceMeta } from './db/schema';
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

// Métricas numéricas que guardamos en Postgres. Un enchufe con medición es de
// tipo 'toggle' pero publica power/energy/voltage/current: sin esto su consumo
// no se persistiría.
const PERSISTED_METRICS = new Set([...NUMERIC_SENSOR_NAMES, 'brightness']);

// Unidad de respaldo cuando Z2M no la declara en sus `exposes`.
const DEFAULT_UNITS: Record<string, string> = {
  temperature: '°C', humidity: '%', pressure: 'hPa', illuminance: 'lx',
  power: 'W', energy: 'kWh', voltage: 'V', current: 'A',
};

function unitsFromExposes(exposes: Z2MExpose[] | undefined): Record<string, string> {
  const units: Record<string, string> = {};
  for (const e of flattenExposes(exposes)) {
    if (e.name && e.unit) units[e.name] = e.unit;
  }
  return units;
}

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

// --- Nombres de usuario (tabla device_meta, clave = dirección IEEE) ---
// Se cachean en memoria porque getAllSensors() es síncrono y se llama en cada
// request. La BD es la fuente de verdad; el Map se refresca en cada escritura.
const deviceNames = new Map<string, string>();

export const DISPLAY_NAME_MAX = 64;

/** Devuelve el nombre saneado, o null si no es válido. */
function normalizeDisplayName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!name || name.length > DISPLAY_NAME_MAX) return null;
  return name;
}

async function loadDeviceNames(): Promise<void> {
  const rows = await db.select().from(deviceMeta);
  deviceNames.clear();
  for (const r of rows) deviceNames.set(r.ieeeAddress, r.displayName);
  console.log(`Nombres personalizados: ${deviceNames.size}`);
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
  const displayName = deviceNames.get(z2m.ieee_address);
  return {
    ...base,
    ...(displayName ? { name: displayName } : {}),
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
// Se pone a true cuando las migraciones se aplican al arrancar. Si falla la BD
// el backend sigue sirviendo estado en vivo, solo se queda sin histórico.
let dbReady = false;

// Z2M republica cada pocos segundos aunque no cambie nada (el enchufe, cada 10s).
// Guardamos una fila solo si el valor cambió, o si hace más de PERSIST_MAX_GAP_MS
// que no guardamos esa métrica — así una serie plana conserva puntos.
const PERSIST_MAX_GAP_MS = 15 * 60 * 1000;
const lastPersisted = new Map<string, { value: number; at: number }>();

function shouldPersist(sensorId: string, metric: string, value: number): boolean {
  const key = `${sensorId}:${metric}`;
  const prev = lastPersisted.get(key);
  const now = Date.now();
  if (prev && prev.value === value && now - prev.at < PERSIST_MAX_GAP_MS) return false;
  lastPersisted.set(key, { value, at: now });
  return true;
}

// --- Emparejamiento (permit join) ---
// Abrir la red Zigbee deja entrar a CUALQUIER dispositivo al alcance mientras la
// ventana esté abierta, así que siempre con un plazo corto y cierre automático.
// Z2M no acepta "indefinido" desde aquí: mandamos siempre un `time` explícito.
const PAIRING_WINDOW_S = 120;
const PAIRING_EVENTS_MAX = 20;

interface PairingEvent {
  type: 'device_joined' | 'device_interview' | 'device_announce' | 'device_leave';
  ieeeAddress: string;
  friendlyName: string;
  /** Solo en device_interview: 'started' | 'successful' | 'failed'. */
  status?: string;
  vendor?: string;
  model?: string;
  supported?: boolean;
  at: string;
}

let permitJoin = false;
/** Timestamp (ms) en que Z2M cerrará la ventana. null si está cerrada. */
let permitJoinEnd: number | null = null;
let pairingError: string | null = null;
const pairingEvents: PairingEvent[] = [];

function pairingSecondsLeft(): number {
  if (!permitJoin || !permitJoinEnd) return 0;
  return Math.max(0, Math.round((permitJoinEnd - Date.now()) / 1000));
}

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
  // 2) Estado del bridge: de aquí sale si la red está abierta a emparejar.
  if (topic === 'zigbee2mqtt/bridge/info') {
    try {
      const info = JSON.parse(message.toString());
      permitJoin = info.permit_join === true;
      // `permit_join_end` solo viene mientras la ventana está abierta.
      permitJoinEnd = permitJoin && typeof info.permit_join_end === 'number' ? info.permit_join_end : null;
    } catch {
      // info malformado: no tocamos el estado anterior.
    }
    return;
  }
  // 3) Eventos de emparejamiento: joined → interview (started/successful/failed) → announce.
  if (topic === 'zigbee2mqtt/bridge/event') {
    try {
      const ev = JSON.parse(message.toString());
      const d = ev?.data ?? {};
      if (!d.ieee_address) return;
      pairingEvents.unshift({
        type: ev.type,
        ieeeAddress: d.ieee_address,
        friendlyName: d.friendly_name ?? d.ieee_address,
        ...(d.status ? { status: d.status } : {}),
        ...(d.definition?.vendor ? { vendor: d.definition.vendor } : {}),
        ...(d.definition?.model ? { model: d.definition.model } : {}),
        ...(typeof d.supported === 'boolean' ? { supported: d.supported } : {}),
        at: new Date().toISOString(),
      });
      pairingEvents.length = Math.min(pairingEvents.length, PAIRING_EVENTS_MAX);
      console.log(`Z2M event: ${ev.type} ${d.ieee_address}${d.status ? ` (${d.status})` : ''}`);
    } catch {
      // evento malformado: lo ignoramos.
    }
    return;
  }
  // 4) Respuesta a nuestra petición de permit_join: solo nos interesa el error.
  if (topic === 'zigbee2mqtt/bridge/response/permit_join') {
    try {
      const r = JSON.parse(message.toString());
      pairingError = r?.status === 'error' ? (r.error ?? 'error desconocido') : null;
      if (pairingError) console.warn('permit_join rechazado:', pairingError);
    } catch {
      // ignorar
    }
    return;
  }
  // Resto de mensajes de bridge/* (state, logging, ...) los ignoramos.
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

  // El try envuelve solo el parseo: así un fallo de BD no se confunde con un
  // mensaje no-JSON (p. ej. availability: online/offline) y no se traga callado.
  let payload: Record<string, any>;
  try {
    payload = JSON.parse(message.toString());
  } catch {
    return;
  }

  // Estado que muestra la UI (una sola cadena por dispositivo)
  let state: string;
  if (sensor.type === 'light') {
    state = payload.state?.toLowerCase() || 'off';
  } else if (sensor.type === 'toggle') {
    const raw = payload.state ?? payload.contact ?? payload.occupancy ?? payload.water_leak;
    state = typeof raw === 'boolean' ? (raw ? 'on' : 'off') : String(raw).toLowerCase();
  } else {
    // slider: el primer numérico relevante del payload
    const primary =
      payload.temperature ??
      payload.humidity ??
      payload.power ??
      payload.energy ??
      payload.value ??
      null;
    state = primary !== null ? String(primary) : 'unknown';
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

  // Persistencia: una fila por métrica numérica del payload.
  if (DATABASE_URL && dbReady) {
    const units = unitsFromExposes(z2m?.definition?.exposes);
    const rows = Object.entries(payload)
      .filter(([name, raw]) => typeof raw === 'number' && PERSISTED_METRICS.has(name))
      .filter(([name, raw]) => shouldPersist(sensor.entityId, name, raw as number))
      .map(([name, raw]) => ({
        sensorId: sensor.entityId,
        type: sensor.type,
        metric: name,
        value: raw as number,
        unit: units[name] ?? DEFAULT_UNITS[name] ?? null,
      }));
    if (rows.length > 0) {
      try {
        await db.insert(sensorData).values(rows);
      } catch (e) {
        console.error('No se pudo guardar en Postgres:', (e as Error).message);
      }
    }
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
// `commit` y `builtAt` se inyectan como build-args en CI para verificar qué
// SHA está corriendo en la Pi: `curl /api/status | jq .commit`.
const COMMIT = process.env.COMMIT_SHA ?? 'dev';
const BUILT_AT = process.env.BUILT_AT ?? new Date().toISOString();
app.get('/api/status', (_req, res) => {
  res.json({
    commit: COMMIT,
    builtAt: BUILT_AT,
    mqtt: {
      connected: mqttConnected,
      host: `${MQTT_HOST}:${MQTT_PORT}`,
      lastMessage: lastMqttMessage,
      messageCount: mqttMessageCount,
    },
    db: { ready: dbReady },
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

// Get history for a sensor. ?metric=power acota a una métrica; ?limit=N (máx 1000).
app.get('/api/history/:entityId', async (req, res) => {
  if (!dbReady) {
    res.status(503).json({ error: 'Persistencia no disponible' });
    return;
  }
  const limit = Math.min(Number(req.query.limit) || 100, 1000);
  const metric = typeof req.query.metric === 'string' ? req.query.metric : null;
  const where = metric
    ? and(eq(sensorData.sensorId, req.params.entityId), eq(sensorData.metric, metric))
    : eq(sensorData.sensorId, req.params.entityId);
  try {
    const rows = await db
      .select()
      .from(sensorData)
      .where(where)
      .orderBy(desc(sensorData.timestamp))
      .limit(limit);
    res.json(rows);
  } catch (error: any) {
    console.error('history:', error.message);
    res.status(500).json({ error: 'Error consultando el histórico' });
  }
});

// --- Emparejamiento ---
app.get('/api/pairing', (_req, res) => {
  res.json({
    permitJoin,
    secondsLeft: pairingSecondsLeft(),
    windowSeconds: PAIRING_WINDOW_S,
    error: pairingError,
    events: pairingEvents,
  });
});

// Abre (`{"enable": true}`) o cierra (`{"enable": false}`) la ventana de
// emparejamiento. Nunca se abre "para siempre": Z2M la cierra sola a los
// PAIRING_WINDOW_S segundos aunque nadie pulse nada.
app.post('/api/pairing', (req, res) => {
  if (!mqttConnected) {
    res.status(503).json({ error: 'Sin conexión MQTT' });
    return;
  }
  if (discoverySource !== 'zigbee2mqtt') {
    res.status(503).json({ error: 'Zigbee2MQTT no está respondiendo' });
    return;
  }
  if (typeof req.body?.enable !== 'boolean') {
    res.status(400).json({ error: 'Se espera { "enable": true | false }' });
    return;
  }
  const enable: boolean = req.body.enable;
  const time = enable ? PAIRING_WINDOW_S : 0;
  if (enable) {
    // Cada sesión de emparejamiento empieza con la lista limpia: lo que se ve en
    // el dashboard es lo que está pasando ahora, no el histórico.
    pairingEvents.length = 0;
  }
  pairingError = null;
  mqttClient.publish('zigbee2mqtt/bridge/request/permit_join', JSON.stringify({ time }), err => {
    if (err) console.error('permit_join publish:', err.message);
  });
  console.log(`permit_join: ${enable ? `abierto ${time}s` : 'cerrado'}`);
  // El estado real llega por `bridge/info` en cuanto Z2M lo aplique; el cliente
  // lo verá en el siguiente GET /api/pairing.
  res.json({ requested: enable, windowSeconds: PAIRING_WINDOW_S });
});

// --- Nombre visible de un dispositivo ---
// Se indexa por dirección IEEE, no por entityId: el entityId es el friendly_name
// de Z2M (topic MQTT + sensor_id del histórico) y debe quedarse quieto.
function findByIeee(ieeeAddress: string) {
  return getAllSensors().find(s => s.ieeeAddress === ieeeAddress);
}

app.put('/api/device/:ieeeAddress/name', async (req, res) => {
  if (!dbReady) {
    res.status(503).json({ error: 'Persistencia no disponible' });
    return;
  }
  const { ieeeAddress } = req.params;
  if (!findByIeee(ieeeAddress)) {
    res.status(404).json({ error: 'Dispositivo no encontrado' });
    return;
  }
  const displayName = normalizeDisplayName(req.body?.name);
  if (!displayName) {
    res.status(400).json({ error: `El nombre debe tener entre 1 y ${DISPLAY_NAME_MAX} caracteres` });
    return;
  }
  try {
    await db
      .insert(deviceMeta)
      .values({ ieeeAddress, displayName })
      .onConflictDoUpdate({
        target: deviceMeta.ieeeAddress,
        set: { displayName, updatedAt: new Date() },
      });
    deviceNames.set(ieeeAddress, displayName);
    res.json({ ieeeAddress, name: displayName });
  } catch (error: any) {
    console.error('rename:', error.message);
    res.status(500).json({ error: 'Error guardando el nombre' });
  }
});

// Quita el nombre de usuario → vuelve a mostrarse el friendly_name de Z2M.
app.delete('/api/device/:ieeeAddress/name', async (req, res) => {
  if (!dbReady) {
    res.status(503).json({ error: 'Persistencia no disponible' });
    return;
  }
  const { ieeeAddress } = req.params;
  try {
    await db.delete(deviceMeta).where(eq(deviceMeta.ieeeAddress, ieeeAddress));
    deviceNames.delete(ieeeAddress);
    res.json({ ieeeAddress, name: findByIeee(ieeeAddress)?.name ?? null });
  } catch (error: any) {
    console.error('rename (delete):', error.message);
    res.status(500).json({ error: 'Error borrando el nombre' });
  }
});

// --- Arranque ---
// Las migraciones se aplican al iniciar el contenedor. La imagen NO lleva
// drizzle-kit (es devDependency y el Dockerfile hace `npm prune --omit=dev`),
// pero `migrate()` vive en drizzle-orm, que sí es dependencia de producción.
const MIGRATIONS_FOLDER = path.join(__dirname, '..', 'drizzle');

async function runMigrations(): Promise<void> {
  if (!DATABASE_URL) {
    console.warn('DATABASE_URL no definida → arrancando sin persistencia');
    return;
  }
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    dbReady = true;
    console.log('Migraciones aplicadas');
    await loadDeviceNames();
  } catch (e) {
    console.error('Fallo aplicando migraciones → sin persistencia:', (e as Error).message);
  }
}

runMigrations().finally(() => {
  app.listen(PORT, () => {
    console.log(`Backend: http://localhost:${PORT}`);
    console.log(`MQTT: ${MQTT_HOST}:${MQTT_PORT}`);
    console.log(`Persistencia: ${dbReady ? 'activa' : 'desactivada'}`);
  });
});
