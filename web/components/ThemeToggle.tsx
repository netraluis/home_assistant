"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ComputerIcon, Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import {
  applyTheme,
  readStoredTheme,
  storeTheme,
  THEMES,
  type Theme,
} from "@/lib/theme";

const LABEL: Record<Theme, string> = {
  system: "Tema: el del sistema",
  light: "Tema: claro",
  dark: "Tema: oscuro",
};

const ICON: Record<Theme, typeof Sun03Icon> = {
  system: ComputerIcon,
  light: Sun03Icon,
  dark: Moon02Icon,
};

export function ThemeToggle() {
  // `null` hasta montar: el servidor no sabe qué hay en localStorage y pintar
  // un icono concreto en SSR daría un parpadeo al hidratar.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(readStoredTheme());
  }, []);

  // En modo `system` seguimos al SO en caliente (cambio automático noche/día).
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  function cycle() {
    const current = theme ?? "system";
    const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
    setTheme(next);
    storeTheme(next);
    applyTheme(next);
  }

  const label = theme ? LABEL[theme] : "Tema";

  return (
    <Button
      variant="outline"
      size="icon-sm"
      onClick={cycle}
      title={`${label} (pulsa para cambiar)`}
      aria-label={label}
    >
      {theme && <HugeiconsIcon icon={ICON[theme]} strokeWidth={1.8} />}
    </Button>
  );
}
