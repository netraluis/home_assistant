/**
 * Marca de Home Control: una casa con el pulso de consumo atravesándola.
 *
 * Sin curvas, a juego con el estilo `base-sera` del preset. El trazo del pulso
 * se recorta con una máscara en vez de pintarse encima, así el hueco deja ver
 * el fondo y la marca funciona igual en claro y en oscuro.
 *
 * El color sale de `currentColor`, o sea de la clase que le ponga quien la use.
 * `app/icon.svg` es la misma marca con el verde fijo, para el favicon.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label="Home Control"
      fill="currentColor"
    >
      <mask id="hc-logo-pulse">
        <rect width="32" height="32" fill="#fff" />
        <path d="M5 23h4.5L12 16l4 10 2.5-3H27" fill="none" stroke="#000" strokeWidth="2.75" />
      </mask>
      <g mask="url(#hc-logo-pulse)">
        <path d="M16 2 31 14H1Z" />
        <path d="M4.5 14h23v16h-23Z" />
      </g>
    </svg>
  );
}
