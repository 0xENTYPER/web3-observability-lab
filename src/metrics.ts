import type {
  CacheSummary,
  DataQuality,
  DriftSignal,
  Observation,
  ProviderSummary,
  QualitySummary,
  SloCheck,
  SloPolicy,
  ValuationKind
} from "./model.js";

export const DEFAULT_SLO: SloPolicy = {
  minimumAvailability: 0.99,
  maximumP95LatencyMs: 800,
  maximumValuationSpreadPercent: 10,
  maximumStaleRate: 0.2
};

export function percentile(values: number[], quantile: number): number | null {
  if (values.length === 0) return null;
  if (quantile < 0 || quantile > 1) throw new RangeError("quantile must be between 0 and 1");

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(quantile * sorted.length) - 1);
  return sorted[index] ?? null;
}

export function summarizeProviders(observations: Observation[]): ProviderSummary[] {
  const groups = new Map<string, Observation[]>();
  for (const observation of observations) {
    const group = groups.get(observation.provider) ?? [];
    group.push(observation);
    groups.set(observation.provider, group);
  }

  return [...groups.entries()].map(([provider, samples]) => {
    const successful = samples.filter((sample) => sample.status === "ok");
    const latencies = successful.flatMap((sample) => sample.latencyMs === null ? [] : [sample.latencyMs]);
    const errors: Record<string, number> = {};
    for (const sample of samples.filter((item) => item.status !== "ok")) {
      const code = sample.errorCode ?? sample.status;
      errors[code] = (errors[code] ?? 0) + 1;
    }

    return {
      provider,
      probes: samples.length,
      successful: successful.length,
      availability: samples.length === 0 ? 0 : successful.length / samples.length,
      p50LatencyMs: percentile(latencies, 0.5),
      p95LatencyMs: percentile(latencies, 0.95),
      errors
    };
  }).sort((a, b) => a.provider.localeCompare(b.provider));
}

export function summarizeCache(observations: Observation[]): CacheSummary {
  const cacheable = observations.filter((sample) => sample.cache !== "none");
  const fresh = cacheable.filter((sample) => sample.cache === "fresh").length;
  const stale = cacheable.filter((sample) => sample.cache === "stale").length;
  const miss = cacheable.filter((sample) => sample.cache === "miss").length;

  return {
    requests: cacheable.length,
    fresh,
    stale,
    miss,
    hitRate: cacheable.length === 0 ? null : (fresh + stale) / cacheable.length,
    staleRate: cacheable.length === 0 ? null : stale / cacheable.length
  };
}

export function summarizeQuality(observations: Observation[]): QualitySummary {
  const successful = observations.filter((sample) => sample.status === "ok");
  const counts: Record<DataQuality, number> = {
    validated: 0,
    partial: 0,
    degraded: 0,
    unknown: 0
  };
  for (const sample of successful) counts[sample.quality] += 1;
  return { samples: successful.length, counts };
}

export function detectValuationDrift(observations: Observation[]): DriftSignal[] {
  const groups = new Map<string, Observation[]>();
  for (const sample of observations.filter((item) => item.status === "ok" && item.independentValuation !== false)) {
    const key = `${sample.batchId}:${sample.chain}:${sample.asset}`;
    const group = groups.get(key) ?? [];
    group.push(sample);
    groups.set(key, group);
  }

  const signals: DriftSignal[] = [];
  for (const samples of groups.values()) {
    for (const kind of ["market-cap", "fdv"] as const) {
      const values = samples.flatMap((sample) => {
        const value = kind === "market-cap" ? sample.marketCapUsd : sample.fdvUsd;
        return value === null || value <= 0 ? [] : [{ provider: sample.provider, value }];
      });
      if (values.length < 2) continue;

      const numeric = values.map(({ value }) => value).sort((a, b) => a - b);
      const median = medianOf(numeric);
      const minimum = numeric[0];
      const maximum = numeric[numeric.length - 1];
      if (minimum === undefined || maximum === undefined || median === 0) continue;
      const spread = ((maximum - minimum) / median) * 100;
      const first = samples[0];
      if (!first) continue;

      signals.push({
        batchId: first.batchId,
        chain: first.chain,
        asset: first.asset,
        kind,
        providers: values.map(({ provider }) => provider).sort(),
        minimumUsd: minimum,
        maximumUsd: maximum,
        medianUsd: median,
        spreadPercent: spread,
        severity: spread >= 20 ? "critical" : spread >= 5 ? "warning" : "normal"
      });
    }
  }

  return signals.sort((a, b) => b.spreadPercent - a.spreadPercent);
}

export function evaluateSlo(
  providers: ProviderSummary[],
  cache: CacheSummary,
  drift: DriftSignal[],
  policy: SloPolicy = DEFAULT_SLO
): SloCheck[] {
  const availability = providers.length === 0 ? null : Math.min(...providers.map((item) => item.availability));
  const p95Values = providers.flatMap((item) => item.p95LatencyMs === null ? [] : [item.p95LatencyMs]);
  const p95 = p95Values.length === 0 ? null : Math.max(...p95Values);
  const spread = drift.length === 0 ? null : Math.max(...drift.map((item) => item.spreadPercent));

  return [
    check("provider availability", availability, policy.minimumAvailability, ">="),
    check("provider p95 latency", p95, policy.maximumP95LatencyMs, "<="),
    check("valuation spread", spread, policy.maximumValuationSpreadPercent, "<="),
    check("stale cache rate", cache.staleRate, policy.maximumStaleRate, "<=")
  ];
}

function check(name: string, actual: number | null, target: number, operator: ">=" | "<="): SloCheck {
  return {
    name,
    actual,
    target,
    operator,
    passed: actual !== null && (operator === ">=" ? actual >= target : actual <= target)
  };
}

function medianOf(values: number[]): number {
  const middle = Math.floor(values.length / 2);
  const current = values[middle];
  if (current === undefined) return 0;
  if (values.length % 2 === 1) return current;
  const previous = values[middle - 1] ?? current;
  return (previous + current) / 2;
}

export function valuationValue(sample: Observation, kind: ValuationKind): number | null {
  return kind === "market-cap" ? sample.marketCapUsd : sample.fdvUsd;
}
