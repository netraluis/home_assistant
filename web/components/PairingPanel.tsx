"use client";

import { useCallback, useEffect, useState } from "react";
import type { PairingEvent, PairingStatus } from "@home/shared";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  Cancel01Icon,
  PlusSignIcon,
  WifiConnected01Icon,
} from "@hugeicons/core-free-icons";
import { api } from "@/lib/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const POLL_OPEN_MS = 2000;
// Cuánto sigue en pantalla el registro después del último evento. Mientras el
// emparejamiento avanza llegan eventos cada pocos segundos y la lista se
// mantiene sola; cuando el dispositivo ya está dentro deja de aportar y se va.
const EVENTS_TTL_MS = 15000;
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
  const shownError = error ?? state?.error;

  // Los eventos vienen del backend con el más reciente primero.
  const newestAt = state?.events[0]?.at;
  const age = newestAt ? Date.now() - new Date(newestAt).getTime() : Infinity;
  const showEvents = age < EVENTS_TTL_MS;

  // El sondeo en reposo va cada 10s, demasiado lento para que la lista
  // desaparezca a tiempo: un temporizador fuerza el repintado justo al vencer.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!newestAt) return;
    const left = EVENTS_TTL_MS - (Date.now() - new Date(newestAt).getTime());
    if (left <= 0) return;
    const t = setTimeout(() => tick((n) => n + 1), left);
    return () => clearTimeout(t);
  }, [newestAt]);

  return (
    <Card size="sm" className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HugeiconsIcon
            icon={WifiConnected01Icon}
            size={18}
            strokeWidth={1.8}
            className={open ? "text-primary" : "text-muted-foreground"}
          />
          Añadir dispositivo
        </CardTitle>
        <CardDescription className="text-xs">
          {open
            ? `Red abierta · se cierra sola en ${state?.secondsLeft ?? 0}s. Resetea ahora el dispositivo para que se una.`
            : `Abre la red ${state?.windowSeconds ?? 120}s para que un dispositivo nuevo pueda unirse.`}
        </CardDescription>
        <CardAction>
          <Button
            size="sm"
            variant={open ? "destructive" : "default"}
            disabled={busy}
            onClick={() => toggle(!open)}
          >
            <HugeiconsIcon icon={open ? Cancel01Icon : PlusSignIcon} />
            {open ? `Cerrar ahora (${state?.secondsLeft ?? 0}s)` : "Abrir emparejamiento"}
          </Button>
        </CardAction>
      </CardHeader>

      {(shownError || showEvents) && (
        <CardContent className="flex flex-col gap-3">
          {shownError && (
            <Alert variant="destructive">
              <HugeiconsIcon icon={Alert02Icon} />
              <AlertDescription>{shownError}</AlertDescription>
            </Alert>
          )}

          {showEvents && state && (
            <>
              <Separator />
              <ol className="flex flex-col gap-1">
                {state.events.map((e, i) => (
                  <li key={`${e.at}-${i}`} className="flex items-center gap-2 text-xs">
                    <EventDot event={e} />
                    <span className="font-mono text-muted-foreground">{e.ieeeAddress}</span>
                    <span className="text-foreground">{describe(e)}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </CardContent>
      )}
    </Card>
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
      ? "bg-destructive"
      : event.status === "successful"
        ? "bg-primary"
        : "bg-muted-foreground";
  return <span className={`inline-block h-2 w-2 shrink-0 ${color}`} />;
}
