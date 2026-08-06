import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const distDir = path.join(root, "dist");
const outputDir = path.join(root, "performance-baseline");

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const absolutePath = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(absolutePath) : absolutePath;
    }),
  );
  return files.flat();
}

function toKiB(bytes) {
  return Number((bytes / 1024).toFixed(2));
}

const files = (await walk(distDir)).filter((file) => /\.(?:js|css)$/.test(file));
const assets = await Promise.all(
  files.map(async (file) => {
    const contents = await readFile(file);
    return {
      file: path.relative(distDir, file).replaceAll("\\", "/"),
      type: path.extname(file).slice(1),
      rawBytes: (await stat(file)).size,
      gzipBytes: gzipSync(contents, { level: 9 }).length,
      sha256: createHash("sha256").update(contents).digest("hex"),
    };
  }),
);

assets.sort((a, b) => b.rawBytes - a.rawBytes);
const indexHtml = await readFile(path.join(distDir, "index.html"), "utf8");
const modulePreloads = [...indexHtml.matchAll(/<link[^>]+rel=["']modulepreload["'][^>]+href=["']([^"']+)/g)].map(
  (match) => match[1],
);
const moduleEntries = [...indexHtml.matchAll(/<script[^>]+type=["']module["'][^>]+src=["']([^"']+)/g)].map(
  (match) => match[1],
);
const totals = assets.reduce(
  (result, asset) => {
    result.rawBytes += asset.rawBytes;
    result.gzipBytes += asset.gzipBytes;
    return result;
  },
  { rawBytes: 0, gzipBytes: 0 },
);
const totalsByType = Object.fromEntries(
  ["js", "css"].map((type) => [
    type,
    assets
      .filter((asset) => asset.type === type)
      .reduce(
        (result, asset) => ({
          rawBytes: result.rawBytes + asset.rawBytes,
          gzipBytes: result.gzipBytes + asset.gzipBytes,
        }),
        { rawBytes: 0, gzipBytes: 0 },
      ),
  ]),
);
const initialAssetUrls = [...new Set([...moduleEntries, ...modulePreloads])];
const initialAssets = initialAssetUrls
  .map((href) => assets.find((asset) => `/${asset.file}` === href))
  .filter(Boolean);
const initialJsTotals = initialAssets.reduce(
  (result, asset) => ({
    rawBytes: result.rawBytes + asset.rawBytes,
    gzipBytes: result.gzipBytes + asset.gzipBytes,
  }),
  { rawBytes: 0, gzipBytes: 0 },
);
const report = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  totals,
  totalsByType,
  moduleEntries,
  modulePreloads,
  initialJsTotals,
  assets,
};

const rows = assets
  .map((asset) => `| ${asset.file} | ${toKiB(asset.rawBytes)} | ${toKiB(asset.gzipBytes)} |`)
  .join("\n");
const markdown = `# Production bundle baseline

Generated: ${report.generatedAt}

| Asset | Raw KiB | Gzip KiB |
|---|---:|---:|
${rows}
| **Total JS + CSS** | **${toKiB(totals.rawBytes)}** | **${toKiB(totals.gzipBytes)}** |
| **Total JS** | **${toKiB(totalsByType.js.rawBytes)}** | **${toKiB(totalsByType.js.gzipBytes)}** |
| **Total CSS** | **${toKiB(totalsByType.css.rawBytes)}** | **${toKiB(totalsByType.css.gzipBytes)}** |

## Module preloads from dist/index.html

${modulePreloads.length ? modulePreloads.map((item) => `- \`${item}\``).join("\n") : "None"}

## Initial JavaScript from dist/index.html

${initialAssetUrls.length ? initialAssetUrls.map((item) => `- \`${item}\``).join("\n") : "None"}

Entry + preloaded JS: **${toKiB(initialJsTotals.rawBytes)} KiB raw / ${toKiB(initialJsTotals.gzipBytes)} KiB gzip**
`;

await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(path.join(outputDir, "bundle-baseline.json"), `${JSON.stringify(report, null, 2)}\n`),
  writeFile(path.join(outputDir, "bundle-baseline.md"), markdown),
]);

console.log(`Bundle baseline written to ${path.relative(root, outputDir)}`);
console.log(`Total JS + CSS: ${toKiB(totals.rawBytes)} KiB raw / ${toKiB(totals.gzipBytes)} KiB gzip`);
console.log(`Entry + preloaded JS: ${toKiB(initialJsTotals.rawBytes)} KiB raw / ${toKiB(initialJsTotals.gzipBytes)} KiB gzip`);
