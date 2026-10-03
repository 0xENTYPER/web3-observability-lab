import { describe, expect, it } from "vitest";
import {
  detectValuationDrift,
  evaluateSlo,
  percentile,
  summarizeCache,
  summarizeProviders,
  summarizeQuality
} from "../src/metrics.js";
import type { Observation } from "../src/model.js";

const base: Observation = {
  batchId: "batch-1",
  observedAt: "2026-10-03T09:00:00.000Z",
  provider: "alpha",
  chain: "base",
  asset: "TOKEN",
  status: "ok",
  latencyMs: 100,
  marketCapUsd: 100,
  fdvUsd: 200,
  quality: "validated",
  cache: "fresh"
};

describe("percentile", () => {
  it("uses nearest-rank percentiles", () => {
    expect(percentile([50, 10, 30, 20, 40], 0.5)).toBe(30);
    expect(percentile([50, 10, 30, 20, 40], 0.95)).toBe(50);
  });

  it("returns null without samples", () => expect(percentile([], 0.95)).toBeNull());
  it("rejects invalid quantiles", () => expect(() => percentile([1], 1.1)).toThrow(RangeError));
});

describe("provider summaries", () => {
  it("keeps failures in availability but out of latency percentiles", () => {
    const result = summarizeProviders([
      base,
      { ...base, batchId: "batch-2", status: "timeout", latencyMs: null, errorCode: "timeout" }
    ])[0];
    expect(result?.availability).toBe(0.5);
    expect(result?.p95LatencyMs).toBe(100);
    expect(result?.errors).toEqual({ timeout: 1 });
  });

  it("sorts providers for deterministic reports", () => {
    expect(summarizeProviders([{ ...base, provider: "zeta" }, { ...base, provider: "alpha" }]).map((item) => item.provider))
      .toEqual(["alpha", "zeta"]);
  });
});

describe("cache and quality", () => {
  it("counts fresh and stale as hits while exposing stale separately", () => {
    const cache = summarizeCache([
      base,
      { ...base, cache: "stale" },
      { ...base, cache: "miss" },
      { ...base, cache: "none" }
    ]);
    expect(cache).toMatchObject({ requests: 3, fresh: 1, stale: 1, miss: 1, hitRate: 2 / 3, staleRate: 1 / 3 });
  });

  it("returns null rates when cache telemetry is absent", () => {
    expect(summarizeCache([{ ...base, cache: "none" }]).hitRate).toBeNull();
  });

  it("excludes failed probes from data-quality counts", () => {
    const quality = summarizeQuality([base, { ...base, status: "error", quality: "unknown" }]);
    expect(quality.samples).toBe(1);
    expect(quality.counts.validated).toBe(1);
    expect(quality.counts.unknown).toBe(0);
  });
});

describe("valuation drift", () => {
  it("calculates MCAP and FDV independently", () => {
    const signals = detectValuationDrift([
      base,
      { ...base, provider: "beta", marketCapUsd: 110, fdvUsd: 202 }
    ]);
    expect(signals).toHaveLength(2);
    expect(signals.find((item) => item.kind === "market-cap")?.severity).toBe("warning");
    expect(signals.find((item) => item.kind === "fdv")?.severity).toBe("normal");
  });

  it("classifies large disagreement as critical", () => {
    const [signal] = detectValuationDrift([base, { ...base, provider: "beta", marketCapUsd: 160 }]);
    expect(signal?.spreadPercent).toBeCloseTo(46.15, 1);
    expect(signal?.severity).toBe("critical");
  });

  it("does not invent drift from a single value", () => {
    expect(detectValuationDrift([{ ...base, fdvUsd: null }])).toEqual([]);
  });

  it("excludes correlated aggregator valuations", () => {
    const signals = detectValuationDrift([
      base,
      { ...base, provider: "beta", marketCapUsd: 110 },
      { ...base, provider: "gateway", marketCapUsd: 100, independentValuation: false }
    ]);
    expect(signals.find((item) => item.kind === "market-cap")?.providers).toEqual(["alpha", "beta"]);
  });
});

describe("SLO checks", () => {
  it("fails closed when a metric has no evidence", () => {
    expect(evaluateSlo([], summarizeCache([]), []).every((item) => !item.passed)).toBe(true);
  });

  it("evaluates the worst provider and largest drift", () => {
    const providers = summarizeProviders([base, { ...base, provider: "beta", latencyMs: 900 }]);
    const drift = detectValuationDrift([base, { ...base, provider: "beta", marketCapUsd: 102 }]);
    const checks = evaluateSlo(providers, summarizeCache([base]), drift);
    expect(checks.find((item) => item.name === "provider availability")?.passed).toBe(true);
    expect(checks.find((item) => item.name === "provider p95 latency")?.passed).toBe(false);
    expect(checks.find((item) => item.name === "valuation spread")?.passed).toBe(true);
  });
});
