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
  /** SHA del commit con el que se construyó la imagen. 'dev' si no se inyectó. */
  commit?: string;
  /** Timestamp ISO del build. */
  builtAt?: string;
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

// --- Emparejamiento de dispositivos nuevos ---

export interface PairingEvent {
  type: 'device_joined' | 'device_interview' | 'device_announce' | 'device_leave';
  ieeeAddress: string;
  friendlyName: string;
  /** Solo en device_interview: 'started' | 'successful' | 'failed'. */
  status?: string;
  vendor?: string;
  model?: string;
  supported?: boolean;
  at: string;
}

/** Respuesta de GET /api/pairing */
export interface PairingStatus {
  permitJoin: boolean;
  secondsLeft: number;
  windowSeconds: number;
  error: string | null;
  /** Más recientes primero, máximo 20. Se vacía al abrir una ventana nueva. */
  events: PairingEvent[];
}

/** Body de POST /api/pairing */
export interface PairingPayload {
  enable: boolean;
}

/** Body de PUT /api/device/:ieeeAddress/name */
export interface RenameDevicePayload {
  name: string;
}

/** Respuesta de PUT/DELETE /api/device/:ieeeAddress/name */
export interface DeviceNameResponse {
  ieeeAddress: string;
  /** Nombre visible resultante. Tras un DELETE, el friendly_name de Z2M. */
  name: string | null;
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
