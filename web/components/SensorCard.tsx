"use client";

import { useState } from "react";
import type { SensorWithState } from "@home/shared";
import { api } from "@/lib/api";
import { isStale, readState } from "@/lib/sensor";

// Sensores que el usuario puede mandar (luces y enchufes). Los binarios
// (puerta, presencia, fuga) son solo lectura.
const CONTROLLABLE = new Set(["light", "toggle"]);
const READONLY_TOGGLES = new Set([
  "binary_sensor.presencia_salon",
  "binary_sensor.fuga_agua_cocina",
  "binary_sensor.puerta_principal",
]);

export function SensorCard({
  sensor,
  onChanged,
}: {
  sensor: SensorWithState;
  onChanged: () => void;
}) {
  const [pending, setPending] = useState(false);
  const { on, raw, value } = readState(sensor);
  const stale = isStale(sensor);
  const canControl =
    CONTROLLABLE.has(sensor.type) && !READONLY_TOGGLES.has(sensor.entityId);

  async function send(body: Parameters<typeof api.control>[1]) {
    setPending(true);
    try {
      await api.control(sensor.entityId, body);
      onChanged();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden>
            {sensor.icon}
          </span>
          <div>
            <p className="font-medium leading-tight">{sensor.name}</p>
            <p className="text-xs text-zinc-400">{sensor.entityId}</p>
          </div>
        </div>
        <StateBadge on={on} raw={raw} stale={stale} type={sensor.type} value={value} unit={sensor.range?.unit} />
      </div>

      {canControl && (
        <div className="flex items-center gap-2">
          <button
            disabled={pending}
            onClick={() => send({ state: "ON" })}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
              on === true
                ? "bg-emerald-500 text-white"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            } disabled:opacity-50`}
          >
            Encender
          </button>
          <button
            disabled={pending}
            onClick={() => send({ state: "OFF" })}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
              on === false
                ? "bg-zinc-700 text-white dark:bg-zinc-600"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            } disabled:opacity-50`}
          >
            Apagar
          </button>
        </div>
      )}

      {canControl && sensor.type === "light" && sensor.range && (
        <div className="mt-3">
          <label className="mb-1 block text-xs text-zinc-400">
            Brillo: {value ?? 0} / {sensor.range.max}
          </label>
          <input
            type="range"
            min={sensor.range.min}
            max={sensor.range.max}
            step={sensor.range.step}
            defaultValue={value ?? 0}
            disabled={pending}
            onChange={(e) =>
              send({ state: "ON", attributes: { brightness: Number(e.target.value) } })
            }
            className="w-full accent-emerald-500"
          />
        </div>
      )}

      {!canControl && (
        <p className="text-xs text-zinc-400">Solo lectura</p>
      )}
    </div>
  );
}

function StateBadge({
  on,
  raw,
  stale,
  type,
  value,
  unit,
}: {
  on: boolean | null;
  raw: string;
  stale: boolean;
  type: string;
  value: number | null;
  unit?: string;
}) {
  if (stale) {
    return <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-400 dark:bg-zinc-800">sin datos</span>;
  }
  if (type === "slider") {
    return (
      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
        {value ?? "?"} {unit ?? ""}
      </span>
    );
  }
  const cls =
    on === true
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
      : on === false
        ? "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
        : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
  const label = on === true ? "ON" : on === false ? "OFF" : raw;
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}
