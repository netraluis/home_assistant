// Tipos compartidos entre el backend (services/) y el frontend (web/).

export type SensorType = 'light' | 'toggle' | 'slider';

export interface SensorRange {
  min: number;
  max: number;
  step: number;
  unit: string;
}

export interface SensorDef {
  entityId: string;
  name: string;
  type: SensorType;
  icon: string;
  mqttTopic: string;
  attributes: Record<string, string>;
  range?: SensorRange;
  // --- Metadatos opcionales rellenados por el descubrimiento de Z2M ---
  vendor?: string;
  model?: string;
  ieeeAddress?: string;
  /** true = descubierto por Zigbee2MQTT (real); false = sólo en config estática (mock). */
  paired?: boolean;
  /** true si el dispositivo expone alguna feature escribible (POST /api/sensor/:id). */
  controllable?: boolean;
}

export interface SensorState {
  state: string;
  attributes: Record<string, unknown>;
  lastSeen: string | Date;
}

/** Respuesta de GET /api/sensors */
export interface SensorWithState extends SensorDef {
  currentState: SensorState | null;
}

/** Body de POST /api/sensor/:entityId */
export interface ControlPayload {
  state?: string;
  attributes?: Record<string, unknown>;
}

/** Respuesta de GET /api/status */
export interface StatusResponse {
  mqtt: {
    connected: boolean;
    host: string;
    lastMessage: string | null;
    messageCount: number;
  };
  discovery: {
    /** 'zigbee2mqtt' = lista real de Z2M; 'mock' = fallback al SENSORS estático; 'none' = aún sin datos. */
    source: 'zigbee2mqtt' | 'mock' | 'none';
    deviceCount: number;
    lastUpdate: string | null;
  };
  uptime: number;
}

/** Fila de GET /api/history/:entityId */
export interface HistoryRow {
  id: number;
  sensorId: string;
  type: SensorType;
  value: number | null;
  unit: string | null;
  timestamp: string;
}

// --- Escenarios (placeholder para fase futura) ---
export interface SceneAction {
  entityId: string;
  payload: ControlPayload;
}

export interface Scene {
  id: string;
  name: string;
  actions: SceneAction[];
}
