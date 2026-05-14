// DEBUG: página mínima sin componentes cliente para descartar el túnel/CF.
// Restaurar `<Dashboard />` cuando confirmemos que CF/Next funcionan.
//
// import { Dashboard } from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Home Control — debug</h1>
      <p>Página mínima sin JS de cliente, sin fetch.</p>
      <p>Si ves esto desde home-assistant.netraluis.xyz, el túnel + Next + Cloudflare funcionan.</p>
      <p>Server time: {new Date().toISOString()}</p>
    </main>
  );
}
