import { drizzle } from 'drizzle-orm/pg-proxy';
import { pgTable, serial, text, varchar } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { sensorData } from './db/schema';

dotenv.config({ path: '../.env' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Ejemplo de lógica: Suscribirse a MQTT o consultar API de HA
console.log('Servicio de backend de Home Assistant iniciado...');

// Aquí iría la lógica para procesar los datos de los sensores y guardarlos en Postgres
async function main() {
  console.log('Conectado a la base de datos:', process.env.DATABASE_URL?.split('@')[1]);
}

main().catch(console.error);
