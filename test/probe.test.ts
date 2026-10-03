import { describe, expect, it, vi } from "vitest";
import { probeGateway } from "../src/probe.js";

describe("probeGateway", () => {
  it("maps typed capitalization and cache metadata", async () => {
    const fetcher = vi.fn(async () => Response.json({
      data: { capitalization: { kind: "market-cap", usd: 123 }, quality: "partial" },
      meta: { cache: "fresh" }
    })) as unknown as typeof fetch;
    const times = [1_000, 1_125];
    const observation = await probeGateway("https://gateway.example", "base", "0xabc", "batch", fetcher, () => times.shift() ?? 1_125);
    expect(observation).toMatchObject({ status: "ok", latencyMs: 125, marketCapUsd: 123, fdvUsd: null, cache: "fresh" });
  });

  it("records HTTP failures without inventing market data", async () => {
    const fetcher = vi.fn(async () => Response.json({ error: "providers_unavailable" }, { status: 503 })) as unknown as typeof fetch;
    const observation = await probeGateway("https://gateway.example", "base", "0xabc", "batch", fetcher, () => 1_000);
    expect(observation).toMatchObject({ status: "error", marketCapUsd: null, fdvUsd: null, errorCode: "providers_unavailable" });
  });

  it("turns network exceptions into observations", async () => {
    const fetcher = vi.fn(async () => { throw new TypeError("offline"); }) as unknown as typeof fetch;
    const observation = await probeGateway("https://gateway.example", "base", "0xabc", "batch", fetcher, () => 1_000);
    expect(observation).toMatchObject({ status: "error", errorCode: "TypeError", quality: "unknown", cache: "none" });
  });
});
