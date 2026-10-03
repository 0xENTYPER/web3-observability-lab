import { readFile } from "node:fs/promises";
import { buildReport } from "./report.js";
import type { Observation } from "./model.js";

const input = process.argv.slice(2).find((argument) => !argument.startsWith("--"));
if (!input) throw new Error("usage: node dist/cli.js <observations.json>");

const observations = JSON.parse(await readFile(input, "utf8")) as Observation[];
const report = buildReport(observations);

console.log(JSON.stringify(report, null, 2));
if (process.argv.includes("--strict") && report.slo.some((check) => !check.passed)) process.exitCode = 2;
