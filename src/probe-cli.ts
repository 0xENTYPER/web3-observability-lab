import { probeGateway } from "./probe.js";

const [baseUrl, chain, asset] = process.argv.slice(2);
if (!baseUrl || !chain || !asset) {
  throw new Error("usage: npm run probe -- <base-url> <chain> <asset>");
}

const observation = await probeGateway(baseUrl, chain, asset, crypto.randomUUID());
console.log(JSON.stringify(observation, null, 2));
process.exitCode = observation.status === "ok" ? 0 : 1;
