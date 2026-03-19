import mqtt from 'mqtt';
import dotenv from 'dotenv';
import { SENSORS } from './sensors';

dotenv.config({ path: '../.env' });

const MQTT_HOST = process.env.MQTT_HOST || 'localhost';
const MQTT_PORT = process.env.MQTT_PORT || '1883';
const MQTT_USER = process.env.MQTT_USER;
const MQTT_PASSWORD = process.env.MQTT_PASSWORD;

const mqttOptions: mqtt.IClientOptions = {};
if (MQTT_USER) mqttOptions.username = MQTT_USER;
if (MQTT_PASSWORD) mqttOptions.password = MQTT_PASSWORD;
const client = mqtt.connect(`mqtt://${MQTT_HOST}:${MQTT_PORT}`, mqttOptions);

function publish(topic: string, payload: Record<string, any>) {
  const msg = JSON.stringify(payload);
  client.publish(topic, msg);
  console.log(`${topic} → ${msg}`);
}

function simulateSensors() {
  console.log('--- Simulando sensores ---');

  // Luz Cocina
  publish('zigbee2mqtt/luz_cocina', {
    state: 'ON',
    brightness: Math.floor(Math.random() * 255),
  });

  // Presencia Salon
  publish('zigbee2mqtt/presencia_salon', {
    occupancy: Math.random() > 0.5,
  });

  // Temperatura Habitacion
  publish('zigbee2mqtt/temperatura_habitacion', {
    temperature: parseFloat((18 + Math.random() * 5).toFixed(1)),
  });

  // Fuga Agua Cocina
  publish('zigbee2mqtt/fuga_agua_cocina', {
    water_leak: false,
  });

  // Puerta Principal
  publish('zigbee2mqtt/puerta_principal', {
    contact: Math.random() > 0.8,
  });

  // Consumo Vitroceramica
  publish('zigbee2mqtt/consumo_vitro', {
    power: Math.random() > 0.8 ? Math.floor(Math.random() * 2000) : 0,
  });
}

client.on('connect', () => {
  console.log('MQTT conectado - iniciando simulacion...');
  simulateSensors();
  setInterval(simulateSensors, 10000);
});
