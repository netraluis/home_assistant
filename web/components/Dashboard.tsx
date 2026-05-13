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
        <ConnBadge status={status} error={error} />
      </header>

      {error && (
        <div className="mb-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          No se puede contactar el backend ({error}). ¿Está corriendo en{" "}
          <code>localhost:3000</code>?
        </div>
      )}

      {!loaded ? (
        <p className="text-zinc-500">Cargando…</p>
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
