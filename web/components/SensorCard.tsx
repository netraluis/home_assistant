"use client";

import { useEffect, useState } from "react";
import type { SensorWithState } from "@home/shared";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowTurnBackwardIcon,
  Cancel01Icon,
  PencilEdit02Icon,
  Tick02Icon,
  ToggleOffIcon,
  ToggleOnIcon,
} from "@hugeicons/core-free-icons";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { isStale, readState } from "@/lib/sensor";
import { SENSOR_ICON } from "@/lib/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";

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
  // Posición que ha pedido el usuario, mientras el backend confirma. El sondeo
  // tarda hasta 2s: sin esto el interruptor saltaría atrás al soltarlo.
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const { on, raw, value } = readState(sensor);
  const stale = isStale(sensor);
  const canControl =
    sensor.controllable ??
    ((sensor.type === "light" || sensor.type === "toggle") &&
      !READONLY_TOGGLES.has(sensor.entityId));
  const shown = optimistic ?? on;
  const switchId = `switch-${sensor.entityId}`;

  useEffect(() => {
    if (optimistic !== null && on === optimistic) setOptimistic(null);
  }, [on, optimistic]);

  async function toggle(next: boolean) {
    setOptimistic(next);
    setPending(true);
    try {
      await api.control(sensor.entityId, { state: next ? "ON" : "OFF" });
      onChanged();
    } catch {
      setOptimistic(null); // no salió: que vuelva a enseñar el estado real
    } finally {
      setPending(false);
    }
  }

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
    <Card size="sm">
      <CardHeader>
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
          <CardTitle className="group flex items-center gap-2">
            <HugeiconsIcon
              icon={SENSOR_ICON[sensor.type]}
              size={18}
              strokeWidth={1.8}
              className="shrink-0 text-muted-foreground"
            />
            <span className="min-w-0 truncate">{sensor.name}</span>
            {sensor.ieeeAddress && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setEditing(true)}
                aria-label={`Renombrar ${sensor.name}`}
                title="Renombrar"
                className="opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
              >
                <HugeiconsIcon icon={PencilEdit02Icon} />
              </Button>
            )}
          </CardTitle>
        )}

        <CardDescription className="text-xs">
          {sensor.vendor || sensor.model
            ? `${sensor.vendor ?? ""} ${sensor.model ?? ""}`.trim()
            : sensor.entityId}
          {sensor.ieeeAddress && (
            <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground/60">
              {sensor.ieeeAddress}
            </span>
          )}
        </CardDescription>

        {/* Con interruptor la chapa de ON/OFF sobra: diría lo mismo dos veces.
            Se queda para lo que el interruptor no cuenta — sin datos, estado
            desconocido, o sensores de solo lectura. */}
        {(!canControl || stale || on === null) && (
          <CardAction>
            <StateBadge
              on={on}
              raw={raw}
              stale={stale}
              type={sensor.type}
              value={value}
              unit={sensor.range?.unit}
            />
          </CardAction>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {canControl ? (
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor={switchId} className="cursor-pointer">
              {shown === true ? "Encendido" : shown === false ? "Apagado" : "Sin estado"}
            </Label>
            <Switch
              id={switchId}
              checked={shown === true}
              disabled={pending}
              onCheckedChange={toggle}
            />
          </div>
        ) : (
          <Badge variant="ghost">Solo lectura</Badge>
        )}

        {canControl && sensor.type === "light" && sensor.range && (
          <div className="flex flex-col gap-2">
            <label className="text-[0.625rem] font-semibold tracking-widest uppercase text-muted-foreground">
              Brillo · {value ?? 0} / {sensor.range.max}
            </label>
            {/* onValueCommitted, no onValueChange: sólo publicamos en MQTT al
                soltar, si no cada píxel de arrastre sería un mensaje. */}
            <Slider
              min={sensor.range.min}
              max={sensor.range.max}
              step={sensor.range.step}
              defaultValue={value ?? 0}
              disabled={pending}
              onValueCommitted={(v) =>
                send({
                  state: "ON",
                  attributes: { brightness: Array.isArray(v) ? v[0] : v },
                })
              }
            />
          </div>
        )}
      </CardContent>
    </Card>
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
        <Input
          autoFocus
          value={value}
          disabled={busy}
          maxLength={64}
          className="h-9"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") onCancel();
          }}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={save}
          disabled={busy}
          title="Guardar"
          aria-label="Guardar nombre"
        >
          <HugeiconsIcon icon={Tick02Icon} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onCancel}
          disabled={busy}
          title="Cancelar"
          aria-label="Cancelar"
        >
          <HugeiconsIcon icon={Cancel01Icon} />
        </Button>
        {canReset && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => run(() => api.resetName(ieeeAddress))}
            disabled={busy}
            title="Volver al nombre de Zigbee2MQTT"
            aria-label="Restablecer nombre"
          >
            <HugeiconsIcon icon={ArrowTurnBackwardIcon} />
          </Button>
        )}
      </div>
      {error && <span className="text-[10px] text-destructive">{error}</span>}
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
  if (stale) return <Badge variant="ghost">sin datos</Badge>;
  if (type === "slider") {
    return (
      <Badge>
        {value ?? "?"} {unit ?? ""}
      </Badge>
    );
  }
  if (on === true) {
    return (
      <Badge>
        <HugeiconsIcon icon={ToggleOnIcon} />
        on
      </Badge>
    );
  }
  if (on === false) {
    return (
      <Badge variant="secondary">
        <HugeiconsIcon icon={ToggleOffIcon} />
        off
      </Badge>
    );
  }
  return <Badge variant="destructive">{raw}</Badge>;
}
