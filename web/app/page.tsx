import { Dashboard } from "@/components/Dashboard";

// Sin esto, Next prerenderiza el HTML y Cloudflare lo cachea con
// `s-maxage=31536000` apuntando a chunks JS con hashes del build viejo.
// Tras un redeploy los chunks cambian de hash → 404 → "page couldn't load".
// Con force-dynamic el HTML se sirve fresh cada request (los chunks con hash
// siguen cacheados por CF, son inmutables).
export const dynamic = "force-dynamic";

export default function Home() {
  return <Dashboard />;
}
