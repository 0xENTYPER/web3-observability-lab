import { describe, expect, it } from "vitest";
import { buildReport } from "../src/report.js";
import type { Observation } from "../src/model.js";

const observation: Observation = {
  batchId: "one",
  observedAt: "2026-10-03T09:00:00.000Z",
  provider: "gateway",
  chain: "base",
  asset: "TOKEN",
  status: "ok",
  latencyMs: 25,
  marketCapUsd: 100,
  fdvUsd: null,
  quality: "validated",
  cache: "fresh"
};

describe("buildReport", () => {
  it("assembles every metric family into one report", () => {
    const report = buildReport([observation], "2026-10-03T10:00:00.000Z");
    expect(report.generatedAt).toBe("2026-10-03T10:00:00.000Z");
    expect(report.observationCount).toBe(1);
    expect(report.providers).toHaveLength(1);
    expect(report.cache.hitRate).toBe(1);
    expect(report.quality.counts.validated).toBe(1);
    expect(report.slo).toHaveLength(4);
  });
});
