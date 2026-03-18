import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const HASS_URL = process.env.HASS_URL || 'http://localhost:8123';
const HASS_TOKEN = process.env.HASS_TOKEN;

const api = axios.create({
  baseURL: `${HASS_URL}/api`,
  headers: {
    Authorization: `Bearer ${HASS_TOKEN}`,
    'Content-Type': 'application/json',
  },
});

async function updateSensor(entityId: string, state: string | number, attributes: any = {}) {
  try {
    await api.post(`/states/${entityId}`, {
      state: state.toString(),
      attributes,
    });
    console.log(`Updated ${entityId} to ${state}`);
  } catch (error: any) {
    console.error(`Error updating ${entityId}: ${error.message}`);
  }
}

async function simulateSensors() {
  console.log('Starting sensor simulation...');

  // 1. Iluminación IKEA Tradfri
  await updateSensor('light.cocina_principal', 'on', { brightness: 255, friendly_name: 'Luz Cocina' });

  // 2. Presencia mmWave (Aqara FP2)
  const presence = Math.random() > 0.5 ? 'on' : 'off';
  await updateSensor('binary_sensor.presencia_salon', presence, { device_class: 'presence', friendly_name: 'Presencia Salón' });

  // 3. Clima (Andorra - Frío)
  const temp = (18 + Math.random() * 5).toFixed(1);
  await updateSensor('sensor.temperatura_habitacion', temp, { unit_of_measurement: '°C', friendly_name: 'Termostato Habitación' });

  // 4. Seguridad: Inundación
  await updateSensor('binary_sensor.fuga_agua_cocina', 'off', { device_class: 'moisture', friendly_name: 'Sensor Inundación Cocina' });

  // 5. Seguridad: Puertas
  await updateSensor('binary_sensor.puerta_principal', 'off', { device_class: 'door', friendly_name: 'Puerta Principal' });

  // 6. Seguridad: Vitrocerámica (Simulado con consumo de energía)
  const vitroPower = Math.random() > 0.8 ? 2000 : 0;
  await updateSensor('sensor.consumo_vitro', vitroPower, { unit_of_measurement: 'W', friendly_name: 'Consumo Vitrocerámica' });
}

// Ejecutar cada 10 segundos
setInterval(simulateSensors, 10000);
simulateSensors();
