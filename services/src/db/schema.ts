import { pgTable, serial, text, timestamp, doublePrecision, index } from 'drizzle-orm/pg-core';

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
