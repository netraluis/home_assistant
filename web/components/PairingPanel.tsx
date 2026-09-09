"use client";

import { useCallback, useEffect, useState } from "react";
import type { PairingEvent, PairingStatus } from "@home/shared";
import { api } from "@/lib/api";

const POLL_OPEN_MS = 2000;
// Cerrada también se sondea, más despacio: la ventana se puede haber abierto
// desde la UI de Z2M, y aquí debe verse igual.
const POLL_IDLE_MS = 10000;

/**
 * Abre la ventana de emparejamiento de Zigbee2MQTT desde el dashboard.
 *
 * Mientras está abierta, CUALQUIER dispositivo Zigbee al alcance puede unirse a
 * la red, así que el backend impone un plazo corto y Z2M la cierra solo. Aquí se
 * enseña la cuenta atrás para que nunca se quede abierta sin que se note.
 */
export function PairingPanel({ onDeviceAdded }: { onDeviceAdded: () => void }) {
  const [state, setState] = useState<PairingStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setState(await api.pairing());
    } catch {
      // El polling del Dashboard ya avisa si el backend no responde.
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const id = setInterval(refresh, state?.permitJoin ? POLL_OPEN_MS : POLL_IDLE_MS);
    return () => clearInterval(id);
  }, [state?.permitJoin, refresh]);

  // Un emparejamiento con éxito cambia la lista de sensores.
  const done = state?.events.some(
    (e) => e.type === "device_interview" && e.status === "successful",
  );
  useEffect(() => {
    if (done) onDeviceAdded();
  }, [done, onDeviceAdded]);

  async function toggle(enable: boolean) {
    setBusy(true);
    setError(null);
    try {
      await api.setPairing(enable);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const open = state?.permitJoin ?? false;

  return (
    <div className="mb-6 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">Añadir dispositivo</p>
          <p className="text-xs text-zinc-500">
            {open
              ? `Red abierta · se cierra sola en ${state?.secondsLeft ?? 0}s. Resetea ahora el dispositivo para que se una.`
              : `Abre la red ${state?.windowSeconds ?? 120}s para que un dispositivo nuevo pueda unirse.`}
          </p>
        </div>
        <button
          disabled={busy}
          onClick={() => toggle(!open)}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${
            open
              ? "bg-amber-500 text-white hover:bg-amber-600"
              : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          }`}
        >
          {open ? `Cerrar ahora (${state?.secondsLeft ?? 0}s)` : "Abrir emparejamiento"}
        </button>
      </div>

      {(error || state?.error) && (
        <p className="mt-2 text-xs text-red-600">{error ?? state?.error}</p>
      )}

      {state && state.events.length > 0 && (
        <ol className="mt-3 space-y-1 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          {state.events.map((e, i) => (
            <li key={`${e.at}-${i}`} className="flex items-center gap-2 text-xs">
              <EventDot event={e} />
              <span className="font-mono text-zinc-400">{e.ieeeAddress}</span>
              <span className="text-zinc-600 dark:text-zinc-300">{describe(e)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function describe(e: PairingEvent): string {
  switch (e.type) {
    case "device_joined":
      return "se ha unido a la red";
    case "device_interview":
      if (e.status === "started") return "identificando…";
      if (e.status === "failed") return "no se pudo identificar";
      return `listo${e.vendor || e.model ? ` · ${[e.vendor, e.model].filter(Boolean).join(" ")}` : ""}${
        e.supported === false ? " (sin soporte en Z2M)" : ""
      }`;
    case "device_announce":
      return "anunciándose";
    case "device_leave":
      return "ha salido de la red";
  }
}

function EventDot({ event }: { event: PairingEvent }) {
  const color =
    event.type === "device_leave" || event.status === "failed"
      ? "bg-red-500"
      : event.status === "successful"
        ? "bg-emerald-500"
        : "bg-amber-500";
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${color}`} />;
}
