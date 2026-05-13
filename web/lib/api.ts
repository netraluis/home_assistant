import type {
  ControlPayload,
  HistoryRow,
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
  control: (entityId: string, body: ControlPayload) =>
    http<{ ok: boolean; topic: string; payload: Record<string, unknown> }>(
      `/api/sensor/${entityId}`,
      { method: "POST", body: JSON.stringify(body) },
    ),
};
