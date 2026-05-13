import type {
  ControlPayload,
  HistoryRow,
  SensorState,
  SensorWithState,
  StatusResponse,
} from "@home/shared";

// URL del backend Node. En dev apunta al puerto 3000; en prod se inyecta por env.
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

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
