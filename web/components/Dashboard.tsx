"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SensorWithState, StatusResponse } from "@home/shared";
import { api } from "@/lib/api";
import { SensorCard } from "@/components/SensorCard";

const POLL_MS = 2000;

export function Dashboard() {
  const [sensors, setSensors] = useState<SensorWithState[]>([]);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const [s, st] = await Promise.all([api.sensors(), api.status().catch(() => null)]);
      setSensors(s);
      setStatus(st);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      busy.current = false;
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Home Control</h1>
          <p className="text-sm text-zinc-500">Proyecto Andorra</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <ConnBadge status={status} error={error} />
          <DiscoveryBadge status={status} />
        </div>
      </header>

      {error && (
        <div className="mb-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          No se puede contactar el backend ({error}). ¿Está corriendo en{" "}
          <code>localhost:3000</code>?
        </div>
      )}

      {!loaded ? (
        <p className="text-zinc-500">Cargando…</p>
      ) : sensors.length === 0 ? (
        <EmptyState status={status} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sensors.map((s) => (
            <SensorCard key={s.entityId} sensor={s} onChanged={refresh} />
          ))}
        </div>
      )}
    </main>
  );
}

function ConnBadge({
  status,
  error,
}: {
  status: StatusResponse | null;
  error: string | null;
}) {
  const ok = !error && status?.mqtt.connected;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full ${
          ok ? "bg-emerald-500" : error ? "bg-red-500" : "bg-amber-500"
        }`}
      />
      <span className="text-zinc-500">
        {error ? "API offline" : ok ? "MQTT conectado" : "MQTT desconectado"}
      </span>
    </div>
  );
}

function DiscoveryBadge({ status }: { status: StatusResponse | null }) {
  if (!status) return null;
  const { source, deviceCount } = status.discovery;
  const labels: Record<typeof source, string> = {
    zigbee2mqtt: `Z2M · ${deviceCount} dispositivo${deviceCount === 1 ? "" : "s"}`,
    mock: `mock · ${deviceCount} sensor${deviceCount === 1 ? "" : "es"} estáticos`,
    none: "esperando inventario Z2M…",
  };
  const colors: Record<typeof source, string> = {
    zigbee2mqtt: "text-emerald-600 dark:text-emerald-400",
    mock: "text-amber-600 dark:text-amber-400",
    none: "text-zinc-400",
  };
  return <span className={`text-xs ${colors[source]}`}>{labels[source]}</span>;
}

function EmptyState({ status }: { status: StatusResponse | null }) {
  const source = status?.discovery.source;
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-6 py-10 text-center dark:border-zinc-700 dark:bg-zinc-900/50">
      <p className="mb-2 text-lg font-medium">No hay sensores</p>
      {source === "zigbee2mqtt" ? (
        <p className="text-sm text-zinc-500">
          Zigbee2MQTT está conectado pero no hay dispositivos parejados.
          <br />
          Empareja uno desde el panel de Z2M (<a className="underline" href="http://localhost:8080" target="_blank" rel="noreferrer">localhost:8080</a>).
        </p>
      ) : source === "none" ? (
        <p className="text-sm text-zinc-500">
          Esperando inventario de Zigbee2MQTT (topic <code>zigbee2mqtt/bridge/devices</code>).
          <br />
          Verifica que Z2M está arrancado y conectado al broker MQTT.
        </p>
      ) : (
        <p className="text-sm text-zinc-500">Lista vacía.</p>
      )}
    </div>
  );
}
