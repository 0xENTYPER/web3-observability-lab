export type ProbeStatus = "ok" | "error" | "timeout";
export type DataQuality = "validated" | "partial" | "degraded" | "unknown";
export type CacheState = "fresh" | "stale" | "miss" | "none";
export type ValuationKind = "market-cap" | "fdv";

export interface Observation {
  batchId: string;
  observedAt: string;
  provider: string;
  chain: string;
  asset: string;
  status: ProbeStatus;
  latencyMs: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  independentValuation?: boolean;
  quality: DataQuality;
  cache: CacheState;
  errorCode?: string;
}

export interface ProviderSummary {
  provider: string;
  probes: number;
  successful: number;
  availability: number;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  errors: Record<string, number>;
}

export interface CacheSummary {
  requests: number;
  fresh: number;
  stale: number;
  miss: number;
  hitRate: number | null;
  staleRate: number | null;
}

export interface DriftSignal {
  batchId: string;
  chain: string;
  asset: string;
  kind: ValuationKind;
  providers: string[];
  minimumUsd: number;
  maximumUsd: number;
  medianUsd: number;
  spreadPercent: number;
  severity: "normal" | "warning" | "critical";
}

export interface QualitySummary {
  samples: number;
  counts: Record<DataQuality, number>;
}

export interface SloPolicy {
  minimumAvailability: number;
  maximumP95LatencyMs: number;
  maximumValuationSpreadPercent: number;
  maximumStaleRate: number;
}

export interface SloCheck {
  name: string;
  passed: boolean;
  actual: number | null;
  target: number;
  operator: ">=" | "<=";
}

export interface ObservabilityReport {
  generatedAt: string;
  observationCount: number;
  providers: ProviderSummary[];
  cache: CacheSummary;
  quality: QualitySummary;
  valuationDrift: DriftSignal[];
  slo: SloCheck[];
}
