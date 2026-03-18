import { pgTable, serial, text, timestamp, doublePrecision } from 'drizzle-orm/pg-core';

export const sensorData = pgTable('sensor_data', {
  id: serial('id').primaryKey(),
  sensorId: text('sensor_id').notNull(),
  type: text('type').notNull(), // 'temp', 'humidity', 'presence', etc.
  value: doublePrecision('value'),
  unit: text('unit'),
  timestamp: timestamp('timestamp').defaultNow(),
});
