import type { SensorWithState } from "@home/shared";

/** Estado normalizado de un sensor: on / off / desconocido + valor numérico. */
export function readState(sensor: SensorWithState): {
  on: boolean | null;
  raw: string;
  value: number | null;
} {
  const cs = sensor.currentState;
  if (!cs) return { on: null, raw: "desconocido", value: null };
  const raw = String(cs.state).toLowerCase();
  const value = numericValue(sensor, cs.attributes, raw);
  let on: boolean | null = null;
  if (raw === "on" || raw === "true" || raw === "open") on = true;
  else if (raw === "off" || raw === "false" || raw === "closed") on = false;
  return { on, raw, value };
}

function numericValue(
  sensor: SensorWithState,
  attrs: Record<string, unknown>,
  raw: string,
): number | null {
  if (sensor.type === "light") {
    const b = attrs["brightness"];
    return typeof b === "number" ? b : null;
  }
  if (sensor.type === "slider") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function isStale(sensor: SensorWithState, maxAgeMs = 60_000): boolean {
  const last = sensor.currentState?.lastSeen;
  if (!last) return true;
  return Date.now() - new Date(last).getTime() > maxAgeMs;
}

/** Una medida lista para pintar: valor ya formateado y su unidad. */
export interface Metric {
  label: string;
  value: string;
  unit: string;
}

// Las unidades las declara Z2M en sus `exposes` y el backend las usa para el
// histórico, pero no viajan con el estado en vivo. Este mapa es el mismo que
// tiene el backend en DEFAULT_UNITS.
const UNITS: Record<string, string> = {
  power: "W",
  voltage: "V",
  current: "A",
  energy: "kWh",
  energy_today: "kWh",
};

const DECIMALS: Record<string, number> = {
  power: 1,
  voltage: 1,
  current: 3,
  energy: 2,
  energy_today: 2,
};

function format(name: string, value: number): string {
  return value.toLocaleString("es-ES", {
    minimumFractionDigits: 0,
    maximumFractionDigits: DECIMALS[name] ?? 1,
  });
}

function metric(
  attrs: Record<string, unknown>,
  name: string,
  label: string,
): Metric | null {
  const raw = attrs[name];
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  return { label, value: format(name, raw), unit: UNITS[name] ?? "" };
}

/**
 * Consumo en vivo de un dispositivo que mide.
 *
 * `power` es la cabecera —es lo que se mira— y el resto acompaña. Devuelve null
 * si el aparato no mide o si sus datos están viejos: enseñar 0 W de hace media
 * hora es peor que no enseñar nada.
 */
export function readPower(
  sensor: SensorWithState,
): { power: Metric; rest: Metric[] } | null {
  const attrs = sensor.currentState?.attributes;
  if (!attrs || isStale(sensor)) return null;

  const power = metric(attrs, "power", "Potencia");
  if (!power) return null;

  const rest = [
    metric(attrs, "voltage", "Tensión"),
    metric(attrs, "current", "Corriente"),
    metric(attrs, "energy_today", "Hoy"),
    metric(attrs, "energy", "Total"),
  ].filter((m): m is Metric => m !== null);

  return { power, rest };
}
