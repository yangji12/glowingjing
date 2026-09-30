// Builds ../Family-Budget.html: the whole app (UI, in-browser backend, libraries)
// in one file that opens with a double-click. Run: npm install && npm run build
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, "..");
const nm = (p) => join(here, "node_modules", p);
const read = (p) => readFileSync(p, "utf8");

const sdk = await build({
  entryPoints: [join(here, "sdk-entry.js")], bundle: true, format: "iife", platform: "browser",
  target: "es2020", minify: true, write: false, legalComments: "none",
});

// Inline scripts must not contain "</script" or they would end the tag early.
function safe(name, code) {
  const out = code.replace(/<\/script/gi, "<\\/script");
  if (/<!--/.test(out)) console.warn(`note: ${name} contains "<!--"`);
  return out;
}
const script = (name, code, attrs = "") => `<script${attrs} data-lib="${name}">\n${safe(name, code)}\n</script>`;

const libs = [
  ["chart.js", read(nm("chart.js/dist/chart.umd.js"))],
  ["pdf.js", read(nm("pdfjs-dist/build/pdf.min.js"))],
  ["jspdf", read(nm("jspdf/dist/jspdf.umd.min.js"))],
  ["jspdf-autotable", read(nm("jspdf-autotable/dist/jspdf.plugin.autotable.min.js"))],
  ["sheetjs", read(nm("xlsx/dist/xlsx.mini.min.js"))],
  ["anthropic-sdk", sdk.outputFiles[0].text],
];

let html = read(join(app, "static/index.html"));
html = html.replace(/<link rel="stylesheet" href="\/static\/style.css">/, () => `<style>\n${read(join(app, "static/style.css"))}\n</style>`);
html = html.replace(/\s*<script src="\/static\/vendor\/chart.umd.js" defer><\/script>/, "");
html = html.replace(/<script src="\/static\/app.js"><\/script>/, () => [
  "<!-- Family Budget (single-file edition). Built from family-budget/static and family-budget/standalone. -->",
  ...libs.map(([n, c]) => script(n, c)),
  script("pdf.js-worker", read(nm("pdfjs-dist/build/pdf.worker.min.js")), ' type="text/plain" id="pdf-worker-src"'),
  script("backend", read(join(here, "backend.js"))),
  script("app", read(join(app, "static/app.js"))),
].join("\n"));

const out = join(app, "Family-Budget.html");
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024 / 1024).toFixed(1)} MB)`);
