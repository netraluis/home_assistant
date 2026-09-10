# web — frontend

Dashboard en Next.js 16 (App Router). Es la **única cara pública** del sistema: en la Pi,
cloudflared solo alcanza este contenedor.

## Arrancar

Desde la raíz del monorepo, no desde aquí:

```bash
npm run dev:web        # http://localhost:3001
```

El navegador pide rutas relativas `/api/*` y Next las reescribe al backend
(`next.config.ts`), así que es siempre el mismo origen y no hay CORS. El destino sale de
`BACKEND_URL` (default `http://localhost:3000`).

Ojo: Next serializa `rewrites()` **en build time**. En la imagen Docker `BACKEND_URL` es un
build-arg; cambiarlo en runtime no tiene ningún efecto.

## La interfaz

Construida con **shadcn/ui**, preset `b6SIAAKX9E`, estilo `base-sera`: esquinas rectas,
botones y etiquetas en mayúsculas, Space Grotesk en los títulos e Inter en el cuerpo.
Por debajo usa **Base UI** (no Radix) e iconos de **Hugeicons**.

- `components/ui/` — los componentes de shadcn. **No son una dependencia**: son código del
  repo, traídos con `npx shadcn add <nombre>`. Para cambiar el aspecto se editan aquí.
- Al escribir UI nueva, usa esos componentes en vez de montar un `<button>` o una tarjeta a
  mano, y tira de los tokens del tema (`bg-card`, `text-muted-foreground`, `bg-primary`) en
  lugar de clases de color fijas, que rompen el modo oscuro y el preset.
- Los iconos salen de `@hugeicons/core-free-icons`; el mapa tipo de sensor → icono está en
  `lib/icons.ts`.

**Tema claro/oscuro**: el botón de la cabecera cicla sistema → claro → oscuro. shadcn hace
el dark mode por clase (`@custom-variant dark (&:is(.dark *))`), o sea que el tema es la
presencia de `.dark` en `<html>`. La lógica vive en `lib/theme.ts` y el script que la aplica
va inline en el `<head>`, antes del primer pintado, para que no haya destello blanco.

## Estructura

```
app/          layout.tsx, page.tsx, globals.css (tokens del tema)
components/   Dashboard, SensorCard, PairingPanel, ThemeToggle
components/ui shadcn: button, card, badge, input, slider, alert, separator, skeleton, empty
lib/          api.ts (cliente fetch), sensor.ts (estado), theme.ts, icons.ts, utils.ts
components.json  config de shadcn (estilo, tokens, alias, librería de iconos)
```
