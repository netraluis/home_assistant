import express from 'express';
import mqtt from 'mqtt';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, desc } from 'drizzle-orm';
import * as dotenv from 'dotenv';
import path from 'path';
import { sensorData } from './db/schema';
import { SENSORS } from './sensors';

dotenv.config({ path: '../.env' });

const PORT = process.env.PORT || 3000;
const MQTT_HOST = process.env.MQTT_HOST || 'localhost';
const MQTT_PORT = process.env.MQTT_PORT || '1883';
const MQTT_USER = process.env.MQTT_USER;
const MQTT_PASSWORD = process.env.MQTT_PASSWORD;
const DATABASE_URL = process.env.DATABASE_URL;

// --- In-memory sensor state ---
interface SensorState {
  state: string;
  attributes: Record<string, any>;
  lastSeen: Date;
}

const sensorStates = new Map<string, SensorState>();

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
});

mqttClient.on('close', () => { mqttConnected = false; });
mqttClient.on('offline', () => { mqttConnected = false; });

mqttClient.on('message', async (topic, message) => {
  // Ignore bridge messages
  if (topic.startsWith('zigbee2mqtt/bridge')) return;

  // Find matching sensor
  const sensor = SENSORS.find(s => s.mqttTopic === topic);
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
      // slider
      value = payload.temperature ?? payload.power ?? payload.value ?? null;
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
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// MQTT status
app.get('/api/status', (_req, res) => {
  res.json({
    mqtt: {
      connected: mqttConnected,
      host: `${MQTT_HOST}:${MQTT_PORT}`,
      lastMessage: lastMqttMessage,
      messageCount: mqttMessageCount,
    },
    uptime: process.uptime(),
  });
});

// List all sensors with current state
app.get('/api/sensors', (_req, res) => {
  const result = SENSORS.map(s => ({
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
  const sensor = SENSORS.find(s => s.entityId === req.params.entityId);
  if (!sensor) {
    res.status(404).json({ error: 'Sensor not found' });
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
