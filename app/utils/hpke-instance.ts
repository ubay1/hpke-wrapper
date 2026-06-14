import { createHpkeServer, type HpkeServerInstance } from "@ubay182/nextjs-hpke-wrapper";

// Shared singleton — auto-generate keys, persist to file, rotate every 24h
export const hpkeServer: HpkeServerInstance = createHpkeServer({
  autoGenerateKeys: true,
  persistKeys: true,
  rotateKeys: true,
  rotationIntervalMs: 24 * 60 * 60 * 1000,
});
