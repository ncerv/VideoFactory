#!/usr/bin/env node
// vf — CLI de VideoFactory.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { formatDiagnostics, runDiagnostics } from "../orchestrator/environment.js";
import { REPO_ROOT } from "../orchestrator/paths.js";
import { formatValidation, validateProject } from "../validation/project.js";
import { buildProject } from "../rendering/build.js";
import { renderProject } from "../rendering/render-project.js";

const HELP = `vf — VideoFactory

Uso:
  vf --version                        Muestra la versión
  vf doctor [--json] [--network]      Diagnostica herramientas, versiones y limitaciones
  vf project validate [dir] [--json]  Valida un proyecto (por defecto, la carpeta actual)
  vf build <dir>                      Genera la composición HyperFrames desde scene.js + timing.json
  vf render <dir> [--quality q] [--workers n] [--json]
                                      Construye, verifica (hyperframes check), renderiza a MP4,
                                      comprueba el resultado con ffprobe/FFmpeg y crea la hoja de contacto
  vf --help                           Muestra esta ayuda

Opciones:
  --json      Salida en JSON
  --network   (doctor) Comprueba el acceso a hosts externos clave (solo abre conexiones TLS)
  --quality   (render) draft | looks (por defecto, CRF 16) | delivery
  --workers   (render) Procesos de captura en paralelo (número o auto)
`;

export function getVersion() {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")).version;
}

export async function main(argv = process.argv.slice(2), { stdout = process.stdout, stderr = process.stderr } = {}) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        version: { type: "boolean", short: "v" },
        help: { type: "boolean", short: "h" },
        json: { type: "boolean" },
        network: { type: "boolean" },
        quality: { type: "string" },
        workers: { type: "string" },
      },
    });
  } catch (e) {
    stderr.write(`${e.message}\n\n${HELP}`);
    return 2;
  }
  const { values, positionals } = parsed;
  const [command, sub, ...rest] = positionals;

  if (values.version) {
    stdout.write(`vf ${getVersion()}\n`);
    return 0;
  }
  if (values.help || !command) {
    stdout.write(HELP);
    return 0;
  }

  if (command === "doctor") {
    const report = await runDiagnostics({ network: Boolean(values.network) });
    stdout.write(values.json ? `${JSON.stringify(report, null, 2)}\n` : `${formatDiagnostics(report)}\n`);
    return report.ready ? 0 : 1;
  }

  if (command === "project" && sub === "validate") {
    if (rest.length > 1) {
      stderr.write("vf project validate admite una sola carpeta\n");
      return 2;
    }
    const res = validateProject(rest[0] ?? process.cwd());
    stdout.write(values.json ? `${JSON.stringify(res, null, 2)}\n` : `${formatValidation(res)}\n`);
    return res.ok ? 0 : 1;
  }

  if (command === "build") {
    if (!sub) {
      stderr.write("Uso: vf build <carpeta-del-proyecto>\n");
      return 2;
    }
    const res = validateProject(sub);
    if (!res.ok) {
      stdout.write(`${formatValidation(res)}\n`);
      return 1;
    }
    const built = await buildProject(sub);
    stdout.write(`Composición generada en ${built.buildDir} (${built.files.join(", ")}) en ${Math.round(built.ms)} ms\n`);
    return 0;
  }

  if (command === "render") {
    if (!sub) {
      stderr.write("Uso: vf render <carpeta-del-proyecto> [--quality draft|looks|delivery] [--workers n]\n");
      return 2;
    }
    if (values.quality && !["draft", "looks", "delivery", "standard", "high"].includes(values.quality)) {
      stderr.write(`Calidad no válida: ${values.quality}\n`);
      return 2;
    }
    try {
      const report = await renderProject(sub, {
        quality: values.quality ?? "looks",
        workers: values.workers ?? null,
        onStep: (name) => values.json || stderr.write(`· ${name}\n`),
      });
      stdout.write(values.json ? `${JSON.stringify(report, null, 2)}\n` : `${formatRenderReport(report)}\n`);
      return report.ok ? 0 : 1;
    } catch (e) {
      stderr.write(`Error: ${e.message}\n`);
      if (e.validation) stderr.write(`${formatValidation(e.validation)}\n`);
      if (e.check) stderr.write(`${JSON.stringify(e.check.result ?? e.check.output, null, 2).slice(0, 4000)}\n`);
      if (e.output) stderr.write(`${String(e.output).slice(-4000)}\n`);
      return 1;
    }
  }

  stderr.write(`Comando desconocido: ${positionals.join(" ")}\n\n${HELP}`);
  return 2;
}

export function formatRenderReport(r) {
  const mark = (ok) => (ok ? "✓" : "✗");
  const lines = [`Render de ${r.project}: ${r.ok ? "correcto" : "CON PROBLEMAS"}`, ""];
  lines.push("Especificación (ffprobe):");
  for (const c of r.spec) lines.push(`  ${mark(c.ok)} ${c.name.padEnd(9)} ${c.detail}`);
  const c = r.continuity;
  lines.push(`Continuidad: ${mark(c.ok)} ${c.pairs} transiciones · dif. media ${c.meanDiff} · máx ${c.maxDiff} · saltos ${c.spikes.length} · congelación máx ${c.longestFrozenRun} fotogramas`);
  lines.push(`Recursos externos: ${mark(r.externalResources.ok)} ${r.externalResources.findings.length} hallazgos en ${r.externalResources.scannedFiles} archivos`);
  lines.push(`hyperframes check: ${mark(r.hyperframesCheck.ok)}`);
  lines.push(`Tiempo de render: ${r.performance.renderSeconds} s (${r.performance.secondsPerFrame} s/fotograma, ${r.performance.realtimeFactor}× tiempo real) · total ${r.timings.total} s`);
  lines.push(`Vídeo: ${r.files.video} (${(r.probe.sizeBytes / 1024 ** 2).toFixed(1)} MB)`);
  lines.push(`Hoja de contacto: ${r.files.contactSheet}`);
  return lines.join("\n");
}

const invokedDirectly = (() => {
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  process.exitCode = await main();
}
