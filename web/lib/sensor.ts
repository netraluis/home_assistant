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
