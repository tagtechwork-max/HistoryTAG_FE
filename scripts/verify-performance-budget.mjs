import { gzipSync } from "node:zlib";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const distDir = path.join(root, "dist");
const baseline = JSON.parse(await readFile(path.join(root, "performance-baseline", "bundle-baseline.json"), "utf8"));
const indexHtml = await readFile(path.join(distDir, "index.html"), "utf8");
const urls = [
  ...indexHtml.matchAll(/<script[^>]+type=["']module["'][^>]+src=["']([^"']+)/g),
  ...indexHtml.matchAll(/<link[^>]+rel=["']modulepreload["'][^>]+href=["']([^"']+)/g),
].map((match) => match[1]);
const initialUrls = [...new Set(urls)];
let initialRawBytes = 0;
let initialGzipBytes = 0;
for (const url of initialUrls) {
  const contents = await readFile(path.join(distDir, url.replace(/^\//, "")));
  initialRawBytes += (await stat(path.join(distDir, url.replace(/^\//, "")))).size;
  initialGzipBytes += gzipSync(contents, { level: 9 }).length;
}

const forbiddenInitialChunks = initialUrls.filter((url) => /vendor-(?:fullcalendar|charts|jvectormap)/i.test(url));
const initialGzipDelta = initialGzipBytes - baseline.initialJsTotals.gzipBytes;
const initialGzipBudgetBytes = Math.ceil(baseline.initialJsTotals.gzipBytes * 1.01);
const checks = {
  initialGzipWithinOnePercentBudget: initialGzipBytes <= initialGzipBudgetBytes,
  heavyRouteChunksNotPreloaded: forbiddenInitialChunks.length === 0,
};
const report = {
  generatedAt: new Date().toISOString(),
  baseline: baseline.initialJsTotals,
  budget: { initialGzipBytes: initialGzipBudgetBytes, tolerancePercent: 1 },
  current: { rawBytes: initialRawBytes, gzipBytes: initialGzipBytes },
  delta: {
    rawBytes: initialRawBytes - baseline.initialJsTotals.rawBytes,
    gzipBytes: initialGzipDelta,
    gzipPercent: Number(((initialGzipDelta / baseline.initialJsTotals.gzipBytes) * 100).toFixed(2)),
  },
  initialUrls,
  forbiddenInitialChunks,
  checks,
  passed: Object.values(checks).every(Boolean),
};
const outputDir = path.join(root, "performance-baseline");
await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, "phase6-bundle-verification.json"), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(path.join(outputDir, "phase6-bundle-verification.md"), `# Phase 6 bundle verification\n\n- Baseline initial JS gzip: ${(baseline.initialJsTotals.gzipBytes / 1024).toFixed(2)} KiB\n- Current initial JS gzip: ${(initialGzipBytes / 1024).toFixed(2)} KiB\n- Delta: ${(initialGzipDelta / 1024).toFixed(2)} KiB (${report.delta.gzipPercent}%)\n- Heavy route chunks preloaded: ${forbiddenInitialChunks.length ? forbiddenInitialChunks.join(", ") : "none"}\n- Result: **${report.passed ? "PASS" : "FAIL"}**\n`);

console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
