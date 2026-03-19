export interface SensorRange {
  min: number;
  max: number;
  step: number;
  unit: string;
}

export interface SensorDef {
  entityId: string;
  name: string;
  type: 'light' | 'toggle' | 'slider';
  icon: string;
  mqttTopic: string;
  attributes: Record<string, string>;
  range?: SensorRange;
}

export const SENSORS: SensorDef[] = [
  {
    entityId: 'light.cocina_principal',
    name: 'Luz Cocina',
    type: 'light',
    icon: '💡',
    mqttTopic: 'zigbee2mqtt/luz_cocina',
    attributes: { friendly_name: 'Luz Cocina' },
    range: { min: 0, max: 255, step: 1, unit: 'brightness' },
  },
  {
    entityId: 'binary_sensor.presencia_salon',
    name: 'Presencia Salón',
    type: 'toggle',
    icon: '🧍',
    mqttTopic: 'zigbee2mqtt/presencia_salon',
    attributes: { device_class: 'presence', friendly_name: 'Presencia Salón' },
  },
  {
    entityId: 'sensor.temperatura_habitacion',
    name: 'Termostato Habitación',
    type: 'slider',
    icon: '🌡️',
    mqttTopic: 'zigbee2mqtt/temperatura_habitacion',
    attributes: { unit_of_measurement: '°C', friendly_name: 'Termostato Habitación' },
    range: { min: 10, max: 35, step: 0.5, unit: '°C' },
  },
  {
    entityId: 'binary_sensor.fuga_agua_cocina',
    name: 'Sensor Inundación Cocina',
    type: 'toggle',
    icon: '💧',
    mqttTopic: 'zigbee2mqtt/fuga_agua_cocina',
    attributes: { device_class: 'moisture', friendly_name: 'Sensor Inundación Cocina' },
  },
  {
    entityId: 'binary_sensor.puerta_principal',
    name: 'Puerta Principal',
    type: 'toggle',
    icon: '🚪',
    mqttTopic: 'zigbee2mqtt/puerta_principal',
    attributes: { device_class: 'door', friendly_name: 'Puerta Principal' },
  },
  {
    entityId: 'sensor.consumo_vitro',
    name: 'Consumo Vitrocerámica',
    type: 'slider',
    icon: '⚡',
    mqttTopic: 'zigbee2mqtt/consumo_vitro',
    attributes: { unit_of_measurement: 'W', friendly_name: 'Consumo Vitrocerámica' },
    range: { min: 0, max: 2000, step: 50, unit: 'W' },
  },
];
