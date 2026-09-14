import { pgTable, serial, text, timestamp, doublePrecision, index, boolean } from 'drizzle-orm/pg-core';

export const sensorData = pgTable(
  'sensor_data',
  {
    id: serial('id').primaryKey(),
    sensorId: text('sensor_id').notNull(),
    type: text('type').notNull(),   // tipo del sensor: 'light' | 'toggle' | 'slider'
    metric: text('metric'),         // métrica concreta: 'power', 'energy', 'temperature', 'brightness', ...
    value: doublePrecision('value'),
    unit: text('unit'),
    timestamp: timestamp('timestamp').defaultNow(),
  },
  (t) => [
    // Todas las consultas son "últimas N lecturas de un sensor".
    index('sensor_data_sensor_id_timestamp_idx').on(t.sensorId, t.timestamp.desc()),
  ],
);

// Nombre visible de cada dispositivo, indexado por su dirección IEEE (inmutable,
// grabada en el chip). Así renombrar es un UPDATE aquí y NO toca el friendly_name
// de Z2M — que es el topic MQTT y el `sensor_id` del histórico. Sin esto, cada
// renombrado movería el topic y desconectaría las lecturas ya guardadas.
export const deviceMeta = pgTable('device_meta', {
  ieeeAddress: text('ieee_address').primaryKey(),
  displayName: text('display_name').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Dispositivos que NO vienen de Zigbee2MQTT: los que entran por un puente
// (el relé Tuya por WiFi, por ejemplo). Antes vivían en la variable de entorno
// MQTT_DEVICES, lo que obligaba a editar el compose y reiniciar para dar uno de
// alta. Aquí, adoptar un dispositivo es un INSERT y se puede hacer desde la UI.
//
// El contrato es el mismo que para cualquier dispositivo del sistema: publica su
// estado en `mqttTopic` y obedece en `<mqttTopic>/set`.
export const mqttDevices = pgTable('mqtt_devices', {
  entityId: text('entity_id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),          // 'light' | 'toggle' | 'slider'
  mqttTopic: text('mqtt_topic').notNull().unique(),
  icon: text('icon'),
  vendor: text('vendor'),
  model: text('model'),
  controllable: boolean('controllable').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
