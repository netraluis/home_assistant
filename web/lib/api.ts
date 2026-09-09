import type {
  ControlPayload,
  DeviceNameResponse,
  HistoryRow,
  PairingStatus,
  SensorState,
  SensorWithState,
  StatusResponse,
} from "@home/shared";

// El navegador hace fetch a rutas relativas; Next reescribe /api/* al backend
// (red interna en prod, localhost en dev) → mismo origen, sin CORS.
export const API_URL = "";

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path} → ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  sensors: () => http<SensorWithState[]>("/api/sensors"),
  sensor: (entityId: string) => http<SensorState>(`/api/sensor/${entityId}`),
  status: () => http<StatusResponse>("/api/status"),
  history: (entityId: string) => http<HistoryRow[]>(`/api/history/${entityId}`),
  pairing: () => http<PairingStatus>("/api/pairing"),
  setPairing: (enable: boolean) =>
    http<{ requested: boolean; windowSeconds: number }>("/api/pairing", {
      method: "POST",
      body: JSON.stringify({ enable }),
    }),
  // El nombre visible se guarda contra la dirección IEEE (inmutable), no contra
  // el entityId: así renombrar no mueve el topic MQTT ni corta el histórico.
  rename: (ieeeAddress: string, name: string) =>
    http<DeviceNameResponse>(`/api/device/${ieeeAddress}/name`, {
      method: "PUT",
      body: JSON.stringify({ name }),
    }),
  resetName: (ieeeAddress: string) =>
    http<DeviceNameResponse>(`/api/device/${ieeeAddress}/name`, { method: "DELETE" }),
  control: (entityId: string, body: ControlPayload) =>
    http<{ ok: boolean; topic: string; payload: Record<string, unknown> }>(
      `/api/sensor/${entityId}`,
      { method: "POST", body: JSON.stringify(body) },
    ),
};
