import { detectValuationDrift, evaluateSlo, summarizeCache, summarizeProviders, summarizeQuality } from "./metrics.js";
import type { Observation, ObservabilityReport, SloPolicy } from "./model.js";

export function buildReport(
  observations: Observation[],
  generatedAt = new Date().toISOString(),
  policy?: SloPolicy
): ObservabilityReport {
  const providers = summarizeProviders(observations);
  const cache = summarizeCache(observations);
  const valuationDrift = detectValuationDrift(observations);

  return {
    generatedAt,
    observationCount: observations.length,
    providers,
    cache,
    quality: summarizeQuality(observations),
    valuationDrift,
    slo: evaluateSlo(providers, cache, valuationDrift, policy)
  };
}
