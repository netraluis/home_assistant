"use client";

import { useCallback, useEffect, useState } from "react";
import type { TuyaCandidate, TuyaStatus } from "@home/shared";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  PlusSignIcon,
  RefreshIcon,
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

const POLL_MS = 10000;

/**
 * Alta de dispositivos que no son Zigbee (hoy, los Tuya por WiFi).
 *
 * A diferencia de Zigbee, meter el aparato en la red **no** se puede hacer desde
 * aquí: eso es el emparejamiento wifi, y lo hace la app del fabricante. Lo que sí
 * se hace aquí es lo demás — preguntarle a la nube qué hay en la cuenta y adoptar
 * lo que aún no esté en el dashboard.
 */
export function WifiDevicesPanel({ onAdopted }: { onAdopted: () => void }) {
  const [state, setState] = useState<TuyaStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setState(await api.tuya());
    } catch {
      // El sondeo del Dashboard ya avisa si el backend no responde.
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  async function scan() {
    setBusy(true);
    setError(null);
    try {
      await api.refreshTuya();
      // El puente tiene que hablar con la nube y volver a publicar: no está
      // listo en el mismo instante.
      await new Promise((r) => setTimeout(r, 2500));
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function adopt(candidate: TuyaCandidate) {
    setBusy(true);
    setError(null);
    try {
      await api.adoptDevice({
        // El topic ya es único y legible; su última parte sirve de identificador
        // estable, y es lo que quedará escrito en el histórico.
        entityId: candidate.topic.split("/").pop() ?? candidate.id,
        name: candidate.name,
        type: "toggle",
        mqttTopic: candidate.topic,
      });
      await refresh();
      onAdopted();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // Sin puente no hay nada que ofrecer, y el panel solo estorbaría.
  if (!state?.bridgeSeen) return null;

  const available = state.available;
  const shownError = error ?? state.error;

  return (
    <Card size="sm" className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HugeiconsIcon
            icon={WifiConnected01Icon}
            size={18}
            strokeWidth={1.8}
            className="text-muted-foreground"
          />
          Dispositivos WiFi
        </CardTitle>
        <CardDescription className="text-xs">
          Empareja el aparato en la app de Tuya y búscalo aquí. Meterlo en la wifi no
          se puede hacer desde el dashboard: eso lo hace la app del fabricante.
        </CardDescription>
        <CardAction>
          <Button size="sm" variant="outline" disabled={busy} onClick={scan}>
            <HugeiconsIcon icon={RefreshIcon} />
            {busy ? "Buscando…" : "Buscar"}
          </Button>
        </CardAction>
      </CardHeader>

      {(shownError || available.length > 0) && (
        <CardContent className="flex flex-col gap-3">
          {shownError && (
            <Alert variant="destructive">
              <HugeiconsIcon icon={Alert02Icon} />
              <AlertDescription>{shownError}</AlertDescription>
            </Alert>
          )}

          {available.length > 0 && (
            <>
              <Separator />
              <ul className="flex flex-col gap-2">
                {available.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm">{c.name}</p>
                      <p className="truncate font-mono text-[10px] text-muted-foreground">
                        {c.topic}
                      </p>
                    </div>
                    {c.hasKey ? (
                      <Button size="xs" disabled={busy} onClick={() => adopt(c)}>
                        <HugeiconsIcon icon={PlusSignIcon} />
                        Añadir
                      </Button>
                    ) : (
                      // Está en la cuenta pero sin local_key: el puente no puede
                      // hablarle, así que adoptarlo daría una tarjeta muerta.
                      <span className="text-[10px] text-muted-foreground uppercase">
                        sin clave
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
