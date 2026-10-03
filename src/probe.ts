import type { CacheState, DataQuality, Observation } from "./model.js";

interface GatewayPayload {
  data?: {
    capitalization?: { kind?: string; usd?: number };
    quality?: DataQuality;
  };
  meta?: { cache?: CacheState };
  error?: string;
}

export async function probeGateway(
  baseUrl: string,
  chain: string,
  asset: string,
  batchId: string,
  fetcher: typeof fetch = fetch,
  now: () => number = () => Date.now()
): Promise<Observation> {
  const startedAt = now();
  const observedAt = new Date(startedAt).toISOString();
  const url = `${baseUrl.replace(/\/$/, "")}/v1/token/${encodeURIComponent(chain)}/${encodeURIComponent(asset)}`;

  try {
    const response = await fetcher(url, { headers: { Accept: "application/json" } });
    const payload = await response.json() as GatewayPayload;
    const latencyMs = Math.max(0, now() - startedAt);
    if (!response.ok || !payload.data) {
      return failed(batchId, observedAt, chain, asset, latencyMs, payload.error ?? `http_${response.status}`);
    }

    const capitalization = payload.data.capitalization;
    return {
      batchId,
      observedAt,
      provider: "pnlflex-gateway",
      chain,
      asset,
      status: "ok",
      latencyMs,
      marketCapUsd: capitalization?.kind === "market-cap" ? capitalization.usd ?? null : null,
      fdvUsd: capitalization?.kind === "fdv" ? capitalization.usd ?? null : null,
      independentValuation: false,
      quality: payload.data.quality ?? "unknown",
      cache: payload.meta?.cache ?? "none"
    };
  } catch (error) {
    return failed(batchId, observedAt, chain, asset, Math.max(0, now() - startedAt), error instanceof Error ? error.name : "network_error");
  }
}

function failed(
  batchId: string,
  observedAt: string,
  chain: string,
  asset: string,
  latencyMs: number,
  errorCode: string
): Observation {
  return {
    batchId,
    observedAt,
    provider: "pnlflex-gateway",
    chain,
    asset,
    status: "error",
    latencyMs,
    marketCapUsd: null,
    fdvUsd: null,
    independentValuation: false,
    quality: "unknown",
    cache: "none",
    errorCode
  };
}
