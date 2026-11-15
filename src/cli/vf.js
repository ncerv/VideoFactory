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
import { previewProject } from "../rendering/preview.js";
import { checkBuild, renderProject, verifyProject } from "../rendering/render-project.js";
import { renderAudioProject } from "../audio/render.js";
import { renderAvProject } from "../av/render.js";

const HELP = `vf — VideoFactory

Uso:
  vf --version                         Muestra la versión
  vf doctor [--json] [--network]       Diagnostica herramientas, versiones y limitaciones
  vf project validate [dir] [--json]   Valida un proyecto (por defecto, la carpeta actual)

  Producción de una escena (scene.js + timing.json), de más barato a más caro:
  vf build <dir> [--force]             Genera la composición HyperFrames (no reescribe si nada cambió)
  vf preview <dir> [--at t1,t2] [--frames n] [--video] [--fps n] [--scale s]
                                       Vista previa rápida a 540×960: fotogramas + hojas de contacto
                                       (por defecto) o MP4 borrador a 15 fps (--video). Sin check ni verificación
  vf check <dir> [--force]             hyperframes check completo (resultado en caché por contenido)
  vf render <dir> [--quality q] [--workers n] [--force] [--json]
                                       Render final 1080×1920 + verificación de entrega + hoja de contacto.
                                       Si nada cambió desde el último render correcto, no vuelve a renderizar
  vf verify <dir> [--json]             Vuelve a verificar el MP4 final existente sin renderizar

  Audio procedural (audio.json + timing.json + audio.js):
  vf audio render <dir> [--force] [--json]
                                       Renderiza offline con Tone.js mezcla y stems WAV (48 kHz, 16 bits,
                                       estéreo) y los verifica. Si nada cambió, no vuelve a renderizar

  Integración audiovisual (av.json: proyecto visual + proyecto de audio):
  vf av render <dir> [--force | --force-video | --force-audio | --force-all] [--json]
                                       Reutiliza el MP4 visual y la mezcla WAV si sus entradas no cambiaron
                                       (si faltan, los genera), copia el vídeo H.264 y codifica el audio a
                                       AAC sin cambiar su ganancia; verifica sincronía, duración y niveles.
                                       Sin opciones, tampoco repite el multiplexado si nada cambió

Opciones:
  --json      Salida en JSON
  --network   (doctor) Comprueba el acceso a hosts externos clave (solo abre conexiones TLS)
  --force     (build, check, render, audio render) Rehace la etapa aunque el contenido no haya cambiado.
              En av render: repite solo el multiplexado y la verificación, no las fuentes
  --force-video  (av render) Regenera también el render visual (vf render --force) y multiplexa
  --force-audio  (av render) Regenera también la mezcla (vf audio render --force) y multiplexa
  --force-all    (av render) Regenera vídeo y audio y multiplexa
  --quality   (render) draft | looks (por defecto, CRF 16) | delivery
  --workers   (render) Procesos de captura en paralelo (número o auto)
  --at        (preview) Instantes en segundos separados por comas
  --frames    (preview) Número de fotogramas repartidos (por defecto 8 o timing.preview.at)
  --video     (preview) MP4 borrador en lugar de fotogramas
  --fps       (preview --video) Fotogramas por segundo del borrador (por defecto 15)
  --scale     (preview) Escala de la vista previa (por defecto 0.5)
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
        force: { type: "boolean" },
        "force-video": { type: "boolean" },
        "force-audio": { type: "boolean" },
        "force-all": { type: "boolean" },
        at: { type: "string" },
        frames: { type: "string" },
        video: { type: "boolean" },
        fps: { type: "string" },
        scale: { type: "string" },
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
  const avForce = ["force-video", "force-audio", "force-all"].filter((k) => values[k]);
  if (avForce.length && !(command === "av" && sub === "render")) {
    stderr.write(`--${avForce[0]} solo es válido con vf av render\n`);
    return 2;
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

  if (command === "audio") {
    const dir = rest[0];
    if (sub !== "render" || !dir) {
      stderr.write("Uso: vf audio render <carpeta-del-proyecto> [--force] [--json]\n");
      return 2;
    }
    try {
      const report = await renderAudioProject(dir, { force: Boolean(values.force), onStep: (name) => values.json || stderr.write(`· ${name}\n`) });
      stdout.write(values.json ? `${JSON.stringify(report, null, 2)}\n` : `${formatAudioReport(report)}\n`);
      return report.ok ? 0 : 1;
    } catch (e) {
      stderr.write(`Error: ${e.message}\n`);
      return 1;
    }
  }

  if (command === "av") {
    const dir = rest[0];
    if (sub !== "render" || !dir) {
      stderr.write("Uso: vf av render <carpeta-del-proyecto> [--force | --force-video | --force-audio | --force-all] [--json]\n");
      return 2;
    }
    try {
      const report = await renderAvProject(dir, { force: Boolean(values.force), forceVideo: Boolean(values["force-video"]), forceAudio: Boolean(values["force-audio"]), forceAll: Boolean(values["force-all"]), onStep: (name) => values.json || stderr.write(`· ${name}\n`) });
      stdout.write(values.json ? `${JSON.stringify(report, null, 2)}\n` : `${formatAvReport(report)}\n`);
      return report.ok ? 0 : 1;
    } catch (e) {
      stderr.write(`Error: ${e.message}\n`);
      return 1;
    }
  }

  const SCENE_COMMANDS = ["build", "preview", "check", "render", "verify"];
  if (SCENE_COMMANDS.includes(command)) {
    if (!sub) {
      stderr.write(`Uso: vf ${command} <carpeta-del-proyecto> (ver vf --help)\n`);
      return 2;
    }
    if (values.quality && !["draft", "looks", "delivery", "standard", "high"].includes(values.quality)) {
      stderr.write(`Calidad no válida: ${values.quality}\n`);
      return 2;
    }
    const num = (v, name) => {
      if (v === undefined) return undefined;
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) throw Object.assign(new Error(`--${name} no válido: ${v}`), { usage: true });
      return n;
    };
    const onStep = (name) => values.json || stderr.write(`· ${name}\n`);
    try {
      const res = validateProject(sub);
      if (!res.ok) {
        stdout.write(`${formatValidation(res)}\n`);
        return 1;
      }
      if (command === "build") {
        const built = await buildProject(sub, { force: Boolean(values.force) });
        stdout.write(`${built.cached ? "= sin cambios" : "✓ generada"} ${path.relative(process.cwd(), built.buildDir)} (hash ${built.hash}, ${Math.round(built.ms)} ms)\n`);
        return 0;
      }
      if (command === "preview") {
        const at = values.at ? values.at.split(",").map((t) => Number(t.trim())) : null;
        if (at?.some((t) => !Number.isFinite(t) || t < 0)) throw Object.assign(new Error(`--at no válido: ${values.at}`), { usage: true });
        const scale = num(values.scale, "scale");
        if (scale !== undefined && scale > 1) throw Object.assign(new Error("--scale debe estar entre 0 y 1"), { usage: true });
        const summary = await previewProject(sub, { at, frames: num(values.frames, "frames"), video: Boolean(values.video), fps: num(values.fps, "fps"), scale, onStep });
        stdout.write(values.json ? `${JSON.stringify(summary, null, 2)}\n` : `${formatPreview(summary)}\n`);
        return 0;
      }
      if (command === "check") {
        const build = await buildProject(sub);
        const checked = await checkBuild(build, { force: Boolean(values.force) });
        const issues = Object.entries(checked.summary).filter(([, v]) => v.errors || v.warnings);
        stdout.write(`${checked.ok ? "✓" : "✗"} hyperframes check${checked.cached ? " (caché, mismo contenido)" : ""}${issues.length ? `: ${issues.map(([k, v]) => `${k} ${v.errors}E/${v.warnings}W [${v.codes.join(", ")}]`).join("; ")}` : ""}\n`);
        return checked.ok ? 0 : 1;
      }
      if (command === "render") {
        const report = await renderProject(sub, { quality: values.quality ?? "looks", workers: values.workers ?? null, force: Boolean(values.force), onStep });
        stdout.write(values.json ? `${JSON.stringify(report, null, 2)}\n` : `${formatRenderReport(report)}\n`);
        return report.ok ? 0 : 1;
      }
      if (command === "verify") {
        const report = await verifyProject(sub, { onStep });
        stdout.write(values.json ? `${JSON.stringify(report, null, 2)}\n` : `${formatRenderReport({ ...report, verifiedOnly: true })}\n`);
        return report.ok ? 0 : 1;
      }
    } catch (e) {
      stderr.write(`Error: ${e.message}\n`);
      if (e.usage) return 2;
      if (e.validation) stderr.write(`${formatValidation(e.validation)}\n`);
      if (e.check) stderr.write(`${JSON.stringify(e.check.result ?? e.check.output, null, 2).slice(0, 4000)}\n`);
      if (e.output) stderr.write(`${String(e.output).slice(-4000)}\n`);
      return 1;
    }
  }

  stderr.write(`Comando desconocido: ${positionals.join(" ")}\n\n${HELP}`);
  return 2;
}

/** Informe breve: una línea de resultado y el detalle solo de lo que falla. */
export function formatRenderReport(r) {
  if (r.cached) {
    return `= ${r.project}: sin cambios desde el último render correcto (hash ${r.buildHash}). ${r.files.video} · ${r.files.contactSheet}\n  Usa --force para renderizar de nuevo.`;
  }
  const p = r.probe;
  const head = `${r.ok ? "✓" : "✗"} ${r.verifiedOnly ? "verificación" : "render"} ${r.project}: ${p.width}x${p.height} · ${p.fps} fps · ${p.frames} fotogramas · ${p.duration.toFixed(3)} s · ${p.codec} ${p.pixFmt}`;
  const c = r.continuity;
  const lines = [head, `  continuidad ${c.ok ? "ok" : "FALLA"} (${c.spikes.length} saltos, congelación máx ${c.longestFrozenRun}) · recursos externos ${r.externalResources.ok ? "0" : r.externalResources.findings.length} · check ${r.hyperframesCheck?.ok ? "ok" : "FALLA"}${r.hyperframesCheck?.cached ? " (caché)" : ""}`];
  for (const s of r.spec.filter((x) => !x.ok)) lines.push(`  ✗ ${s.name}: ${s.detail}`);
  for (const f of r.externalResources.findings.slice(0, 5)) lines.push(`  ✗ recurso ${f.kind}: ${f.value} (${f.file})`);
  if (c.spikes.length) lines.push(`  ✗ saltos en fotogramas: ${c.spikes.slice(0, 8).map((x) => x.frame).join(", ")}`);
  if (r.staleBuild) lines.push("  ✗ el vídeo no corresponde a la construcción actual: ejecuta vf render");
  if (!r.verifiedOnly) lines.push(`  render ${r.performance.renderSeconds} s · total ${r.timings.total} s · ${r.files.video} (${(p.sizeBytes / 1024 ** 2).toFixed(1)} MB) · ${r.files.contactSheet}`);
  else lines.push(`  ${r.files?.video ?? ""} · ${r.files?.contactSheet ?? ""}`);
  return lines.join("\n");
}

/** Informe breve del render de audio: resultado, formato, nivel y solo los fallos en detalle. */
export function formatAudioReport(r) {
  if (r.cached) return `= ${r.project}: audio sin cambios (hash ${r.inputsHash}). ${r.files.mix}${Object.keys(r.files.stems).length ? ` + ${Object.keys(r.files.stems).length} stems` : ""} · usa --force para regenerar`;
  const v = r.verification;
  const p = v.probes[r.files.mix];
  const head = `${r.ok ? "✓" : "✗"} audio ${r.project}: ${p.codec} · ${p.sampleRate} Hz · ${p.bitDepth} bits · ${p.channels} canales · ${p.frames} muestras (${p.duration.toFixed(3)} s)`;
  const lines = [head, `  pico ${v.mix.peakDb} dBFS · ${v.loudness?.integratedLufs ?? "?"} LUFS · true peak ${v.loudness?.truePeakDb ?? "?"} dBTP · banda de voz ${v.voiceBandDb} dB · stems ${Object.keys(r.files.stems).join(", ") || "no"}`];
  for (const c of v.checks.filter((x) => !x.ok)) lines.push(`  ✗ ${c.name}: ${c.detail}`);
  for (const f of v.externalResources.findings.slice(0, 5)) lines.push(`  ✗ recurso ${f.kind}: ${f.value}`);
  lines.push(`  ${r.timings.total} s · output/${r.files.mix}${v.review ? ` · output/${v.review}` : ""}`);
  return lines.join("\n");
}

/** Informe breve de la integración audiovisual: resultado, vídeo, audio, sincronía y solo los fallos. */
export function formatAvReport(r) {
  const state = (s) => (s.forced ? " (regenerado)" : s.cached ? " (caché)" : " (generado)");
  const src = `${r.sources.video.project}${state(r.sources.video)} + ${r.sources.audio.project}${state(r.sources.audio)}`;
  if (r.cached) return `= ${r.project}: sin cambios (hash ${r.inputsHash}). ${r.output.file} · fuentes ${src} · --force repite el multiplexado; --force-video/--force-audio/--force-all regeneran fuentes`;
  const v = r.video;
  const a = r.audio;
  const lines = [
    `${r.ok ? "✓" : "✗"} av ${r.project}: ${v.width}x${v.height} · ${v.fps} fps · ${v.frames} fotogramas · ${v.codec} (copiado) + ${a.codec} ${a.profile} ${a.sampleRate} Hz ${a.channels} canales ${Math.round(a.bitRate / 1000)} kb/s · ${r.output.duration.toFixed(3)} s`,
    `  inicio vídeo ${v.startTime} s / audio ${a.startTime} s · desfase ${a.lagSamples} muestras (inicio ${a.lagStartSamples} / final ${a.lagEndSamples}) · ${a.integratedLufs} LUFS · true peak ${a.truePeakDb} dBTP (fuente ${a.source.integratedLufs} LUFS / ${a.source.truePeakDb} dBTP) · Δnivel ${a.levelDiffDb} dB`,
  ];
  for (const c of r.checks.filter((x) => !x.ok)) lines.push(`  ✗ ${c.name}: ${c.detail}`);
  lines.push(`  fuentes ${src} · ${r.timings.total} s · output/${path.basename(r.output.file)} (${(r.output.sizeBytes / 1024 ** 2).toFixed(1)} MB)`);
  return lines.join("\n");
}

export function formatPreview(s) {
  const what = s.mode === "video" ? `${s.video} (${s.fps} fps, ${s.quality})` : `${s.frames.length} fotogramas en [${s.times.join(", ")}] s · ${s.contactSheets.join(", ")}`;
  return `✓ vista previa ${s.project} ${s.size}${s.buildCached ? " (construcción en caché)" : ""}: ${what} · ${s.timings.total} s`;
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
