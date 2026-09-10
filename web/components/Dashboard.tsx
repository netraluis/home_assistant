"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SensorWithState, StatusResponse } from "@home/shared";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon, InboxIcon, RouterIcon } from "@hugeicons/core-free-icons";
import { api } from "@/lib/api";
import { SensorCard } from "@/components/SensorCard";
import { PairingPanel } from "@/components/PairingPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/Logo";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";

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
        <div className="flex items-center gap-3">
          <Logo className="size-9 shrink-0 text-primary" />
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-wider uppercase">
              Home Control
            </h1>
            <p className="text-sm text-muted-foreground">Proyecto Andorra</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end gap-1">
            <ConnBadge status={status} error={error} />
            <DiscoveryBadge status={status} />
          </div>
          <ThemeToggle />
        </div>
      </header>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <HugeiconsIcon icon={Alert02Icon} />
          <AlertTitle>No se puede contactar el backend</AlertTitle>
          <AlertDescription>
            {error}. ¿Está corriendo en <code>localhost:3000</code>?
          </AlertDescription>
        </Alert>
      )}

      {loaded && status?.discovery?.source === "zigbee2mqtt" && (
        <PairingPanel onDeviceAdded={refresh} />
      )}

      {!loaded ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 w-full" />
          ))}
        </div>
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
    <Badge variant={error ? "destructive" : ok ? "default" : "secondary"}>
      <span
        className={`inline-block h-2 w-2 shrink-0 ${
          ok ? "bg-primary" : error ? "bg-destructive" : "bg-muted-foreground"
        }`}
      />
      {error ? "API offline" : ok ? "MQTT conectado" : "MQTT desconectado"}
    </Badge>
  );
}

function DiscoveryBadge({ status }: { status: StatusResponse | null }) {
  // Defensa: backend antiguo sin campo `discovery` no debe crashear el dashboard.
  if (!status?.discovery) return null;
  const { source, deviceCount } = status.discovery;
  const labels: Record<typeof source, string> = {
    zigbee2mqtt: `Z2M · ${deviceCount} dispositivo${deviceCount === 1 ? "" : "s"}`,
    mock: `mock · ${deviceCount} sensor${deviceCount === 1 ? "" : "es"} estáticos`,
    none: "esperando inventario Z2M…",
  };
  const variants: Record<typeof source, "default" | "secondary" | "ghost"> = {
    zigbee2mqtt: "default",
    mock: "secondary",
    none: "ghost",
  };
  return <Badge variant={variants[source]}>{labels[source]}</Badge>;
}

function EmptyState({ status }: { status: StatusResponse | null }) {
  const source = status?.discovery?.source;
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HugeiconsIcon icon={source === "none" ? RouterIcon : InboxIcon} />
        </EmptyMedia>
        <EmptyTitle>No hay sensores</EmptyTitle>
        <EmptyDescription>
          {source === "zigbee2mqtt" ? (
            <>
              Zigbee2MQTT está conectado pero no hay dispositivos emparejados. Usa{" "}
              <strong>Añadir dispositivo</strong> aquí arriba y resetea el aparato para
              que se una.
            </>
          ) : source === "none" ? (
            <>
              Esperando inventario de Zigbee2MQTT (topic{" "}
              <code>zigbee2mqtt/bridge/devices</code>). Verifica que Z2M está arrancado y
              conectado al broker MQTT.
            </>
          ) : (
            "Lista vacía."
          )}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
