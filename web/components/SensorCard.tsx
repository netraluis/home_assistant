"use client";

import { useState } from "react";
import type { SensorWithState } from "@home/shared";
import { api } from "@/lib/api";
import { isStale, readState } from "@/lib/sensor";

// Sensores controlables (luces y enchufes con `state` escribible).
// Backend marca `controllable` desde Z2M exposes; fallback heurístico para mock.
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
  const [editing, setEditing] = useState(false);
  const { on, raw, value } = readState(sensor);
  const stale = isStale(sensor);
  const canControl =
    sensor.controllable ??
    ((sensor.type === "light" || sensor.type === "toggle") &&
      !READONLY_TOGGLES.has(sensor.entityId));

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
            {editing && sensor.ieeeAddress ? (
              <NameEditor
                ieeeAddress={sensor.ieeeAddress}
                current={sensor.name}
                canReset={sensor.name !== sensor.attributes.friendly_name}
                onDone={() => {
                  setEditing(false);
                  onChanged();
                }}
                onCancel={() => setEditing(false)}
              />
            ) : (
              <p className="group flex items-center gap-1 font-medium leading-tight">
                {sensor.name}
                {sensor.ieeeAddress && (
                  <button
                    onClick={() => setEditing(true)}
                    aria-label={`Renombrar ${sensor.name}`}
                    title="Renombrar"
                    className="opacity-0 transition group-hover:opacity-100 focus:opacity-100"
                  >
                    ✏️
                  </button>
                )}
              </p>
            )}
            <p className="text-xs text-zinc-400">
              {sensor.vendor || sensor.model
                ? `${sensor.vendor ?? ""} ${sensor.model ?? ""}`.trim()
                : sensor.entityId}
            </p>
            {sensor.ieeeAddress && (
              <p className="text-[10px] font-mono text-zinc-300 dark:text-zinc-600">
                {sensor.ieeeAddress}
              </p>
            )}
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

// El nombre vive en la BD del backend (tabla device_meta) indexado por IEEE.
// Z2M no se entera: su friendly_name — y con él el topic MQTT y el sensor_id del
// histórico — no se toca.
function NameEditor({
  ieeeAddress,
  current,
  canReset,
  onDone,
  onCancel,
}: {
  ieeeAddress: string;
  current: string;
  canReset: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const save = () => {
    const name = value.trim();
    if (!name || name === current) {
      onCancel();
      return;
    }
    run(() => api.rename(ieeeAddress, name));
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={value}
          disabled={busy}
          maxLength={64}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") onCancel();
          }}
          className="w-40 rounded border border-zinc-300 bg-white px-2 py-0.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
        />
        <button onClick={save} disabled={busy} title="Guardar" aria-label="Guardar nombre">
          ✅
        </button>
        <button onClick={onCancel} disabled={busy} title="Cancelar" aria-label="Cancelar">
          ✖️
        </button>
        {canReset && (
          <button
            onClick={() => run(() => api.resetName(ieeeAddress))}
            disabled={busy}
            title="Volver al nombre de Zigbee2MQTT"
            aria-label="Restablecer nombre"
          >
            ↩️
          </button>
        )}
      </div>
      {error && <span className="text-[10px] text-red-600">{error}</span>}
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
