// Tema de la interfaz. shadcn usa dark mode por clase
// (`@custom-variant dark (&:is(.dark *))` en globals.css), así que el tema es
// la presencia de `.dark` en <html>. Aquí vive la única fuente de verdad sobre
// cómo se lee, se guarda y se aplica.

export type Theme = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "ha-theme";
export const THEMES: Theme[] = ["system", "light", "dark"];

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as string[]).includes(value);
}

export function readStoredTheme(): Theme {
  // localStorage puede lanzar (modo privado, cookies bloqueadas): `system` es
  // un buen fallback porque respeta lo que ya prefiere el sistema operativo.
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(raw) ? raw : "system";
  } catch {
    return "system";
  }
}

export function storeTheme(theme: Theme): void {
  try {
    if (theme === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Sin persistencia el toggle sigue funcionando para esta pestaña.
  }
}

export function prefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(theme: Theme): void {
  const dark = theme === "dark" || (theme === "system" && prefersDark());
  document.documentElement.classList.toggle("dark", dark);
}

// Se inyecta en <head> y corre antes del primer pintado para que no haya
// destello blanco al cargar con el tema oscuro puesto. Debe ser autocontenido:
// no puede importar nada de este módulo en tiempo de ejecución.
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;
