// `vf av render`: integración audiovisual de un proyecto visual y uno de audio.
//
// Flujo: av.json → vf render del proyecto visual y vf audio render del de audio (cada uno con su caché:
// si sus entradas funcionales no cambiaron, no se vuelve a renderizar) → comprobación del WAV maestro
// (PCM, frecuencia, canales, duración) → FFmpeg: vídeo H.264 copiado + mezcla a AAC, sin filtros ni
// cambios de ganancia → verificación → output/av-report.json.
// Los proyectos fuente no se modifican: solo se leen sus salidas, y se comprueba con SHA-256 que el
// multiplexado no las altera. La caché de esta etapa depende del contenido de las fuentes (SHA-256 del
// MP4 y del WAV), de av.json, del grafo de módulos de la integración y de la versión de FFmpeg.
//
// Forzado (independiente por etapa, nunca implícito):
//   force       → repite solo el multiplexado y la verificación;
//   forceVideo  → regenera el render visual (vf render --force) y después multiplexa;
//   forceAudio  → regenera la mezcla (vf audio render --force) y después multiplexa.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ffmpegVersion, muxAudioVideo } from "../adapters/ffmpeg.js";
import { renderAudioProject } from "../audio/render.js";
import { renderMixProject } from "../mix/render.js";
import { probeWav } from "../audio/verify.js";
import { hashFiles, moduleGraph } from "../orchestrator/fingerprint.js";
import { paths } from "../orchestrator/paths.js";
import { renderProject } from "../rendering/render-project.js";
import { validateAgainst } from "../validation/schemas.js";
import { verifyAvOutput } from "./verify.js";

const seconds = (ms) => Math.round(ms) / 1000;
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const sha256 = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
export const AV_DEFAULTS = { quality: "looks", audio: { codec: "aac", bitrate: "192k", sampleRate: 48000, channels: 2 } };

/** Proveedores de fuentes por defecto: los motores reales con su caché. Las pruebas los sustituyen. */
export const DEFAULT_PROVIDERS = {
  video: (dir, { quality, force, onStep }) => renderProject(dir, { quality, force, onStep }),
  audio: (dir, { force, onStep, use = "mix" }) => (use === "multitrack" ? renderMixProject(dir, { force, onStep }) : renderAudioProject(dir, { force, onStep })),
};

/** Traduce las opciones de la CLI a la política de forzado por etapa. */
export function forcePolicy({ force = false, forceVideo = false, forceAudio = false, forceAll = false } = {}) {
  const video = Boolean(forceVideo || forceAll);
  const audio = Boolean(forceAudio || forceAll);
  return { video, audio, mux: Boolean(force || video || audio) };
}

/** Carga y valida av.json y resuelve las carpetas de los proyectos fuente (dentro de projects/). */
export function loadAvProject(projectDir) {
  const dir = path.resolve(projectDir);
  const file = path.join(dir, "av.json");
  if (!fs.existsSync(file)) throw new Error(`No existe av.json en ${dir}`);
  const manifest = readJson(file);
  const errors = validateAgainst("avProject", manifest);
  if (errors.length) throw Object.assign(new Error(`av.json no válido: ${errors.map((e) => `${e.instancePath} ${e.message}`).join("; ")}`), { errors });
  if (manifest.id !== path.basename(dir)) throw new Error(`El id "${manifest.id}" no coincide con la carpeta "${path.basename(dir)}"`);
  const resolveSource = (rel, kind, marker) => {
    const d = path.resolve(dir, rel);
    if (path.dirname(d) !== path.dirname(dir)) throw new Error(`${kind}: ${rel} debe ser un proyecto hermano`);
    if (d === dir) throw new Error(`${kind}: no puede apuntar al propio proyecto de integración`);
    if (!fs.existsSync(path.join(d, marker))) throw new Error(`${kind}: no existe ${path.join(rel, marker)}`);
    return d;
  };
  const videoDir = resolveSource(manifest.video.project, "video.project", "project.json");
  const use = manifest.audio.use ?? "mix";
  const audioDir = resolveSource(manifest.audio.project, "audio.project", use === "multitrack" ? "mix.json" : "audio.json");
  const settings = {
    quality: manifest.video.quality ?? AV_DEFAULTS.quality,
    audioUse: use,
    audio: { ...AV_DEFAULTS.audio, ...(manifest.output?.audio ?? {}) },
  };
  return { dir, file, manifest, videoDir, audioDir, settings };
}

/** Módulos de la integración (grafo de imports desde este archivo, sin documentación). */
export const integrationModules = () => moduleGraph([fileURLToPath(import.meta.url)]);

/**
 * Huella de todo lo que determina el MP4: contenido de las fuentes, ajustes efectivos, av.json,
 * código de la integración y versión de FFmpeg. Los README no cuentan.
 */
export function avInputsHash({ manifestFile, settings, video, audio, stems = {}, ffmpeg }) {
  const h = createHash("sha256");
  h.update("av.json\0").update(fs.readFileSync(manifestFile)).update("\0");
  h.update(JSON.stringify({ settings, video, audio, stems, ffmpeg }));
  h.update("modules\0");
  hashFiles(h, integrationModules());
  return h.digest("hex").slice(0, 16);
}

/**
 * Formato del WAV maestro frente al que exige la salida. Esta etapa no convierte: la mezcla debe
 * llegar ya en PCM a la frecuencia y con los canales de salida (ver src/av/README.md → Voz TTS).
 */
export function checkMasterFormat(p, { sampleRate, channels, duration, fps }) {
  const issues = [];
  if (!/^pcm_s(16|24)le$/.test(p.codec)) issues.push(`códec ${p.codec} (se espera PCM de 16 o 24 bits)`);
  if (p.sampleRate !== sampleRate) issues.push(`${p.sampleRate} Hz (se esperan ${sampleRate} Hz)`);
  if (p.channels !== channels) issues.push(`${p.channels} canales (se esperan ${channels})`);
  if (Math.abs(p.duration - duration) > 1 / fps) issues.push(`${p.duration.toFixed(3)} s frente a ${duration} s de vídeo`);
  return issues;
}

/**
 * Multiplexa y verifica (sin tocar las fuentes). Separado del render de los proyectos fuente
 * para poder probarlo con entradas sintéticas.
 * @param o.stems { id: ruta WAV } opcional: comprueba que cada stem sigue presente en el AAC
 * @returns { ok, mux, verification, inputs, sha256 }
 */
export async function muxAndVerify({ video, audio, output, expected, audioSettings = AV_DEFAULTS.audio, stems = {}, step = (_n, fn) => fn() }) {
  const before = { video: sha256(video), audio: sha256(audio), stems: Object.fromEntries(Object.entries(stems).map(([k, f]) => [k, sha256(f)])) };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const tmp = `${output}.partial.mp4`;
  const mux = await step("mux", () => muxAudioVideo({ video, audio, output: tmp, bitrate: audioSettings.bitrate, sampleRate: audioSettings.sampleRate, channels: audioSettings.channels }));
  fs.renameSync(tmp, output);
  const verification = await step("verify", () =>
    verifyAvOutput({ file: output, sourceVideo: video, sourceAudio: audio, stems, expected: { ...expected, sampleRate: audioSettings.sampleRate, channels: audioSettings.channels, audioCodec: audioSettings.codec } }),
  );
  const after = { video: sha256(video), audio: sha256(audio), stems: Object.fromEntries(Object.entries(stems).map(([k, f]) => [k, sha256(f)])) };
  const unchanged = JSON.stringify(before) === JSON.stringify(after);
  verification.checks.push({ name: "fuentes-intactas", ok: unchanged, detail: unchanged ? "SHA-256 del MP4 visual, del WAV maestro y de los stems iguales antes y después" : "una fuente cambió durante la integración" });
  verification.ok = verification.ok && unchanged;
  return { ok: verification.ok, mux, verification, inputs: { videoSha256: after.video, audioSha256: after.audio }, sha256: sha256(output) };
}

/**
 * @param o { force, forceVideo, forceAudio, forceAll, onStep(name), providers }
 * @returns informe (también en output/av-report.json); cached: true si no hizo falta multiplexar
 */
export async function renderAvProject(projectDir, { onStep = () => {}, providers = DEFAULT_PROVIDERS, ...forceOptions } = {}) {
  const t0 = performance.now();
  const timings = {};
  const step = async (name, fn) => {
    onStep(name);
    const s = performance.now();
    const r = await fn();
    timings[name] = seconds(performance.now() - s);
    return r;
  };
  const force = forcePolicy(forceOptions);

  const av = await step("load", () => loadAvProject(projectDir));
  const { dir, manifest, videoDir, audioDir, settings } = av;
  const sub = (prefix) => (name) => onStep(`${prefix}:${name}`);

  // Fuentes: cada proyecto conserva su flujo y su caché; solo se regeneran si se pide expresamente.
  const visual = await step("video", () => providers.video(videoDir, { quality: settings.quality, force: force.video, onStep: sub("video") }));
  if (!visual.ok) throw new Error(`El render visual de ${visual.project} no es correcto`);
  const sound = await step("audio", () => providers.audio(audioDir, { force: force.audio, use: settings.audioUse, onStep: sub("audio") }));
  if (!sound.ok) throw new Error(`El render de audio de ${sound.project} no es correcto`);

  const videoFile = path.resolve(videoDir, visual.files.video);
  const audioOut = path.join(audioDir, "output");
  const audioFile = path.join(audioOut, sound.files.mix);
  const stems = Object.fromEntries(Object.entries(sound.files.stems ?? {}).map(([id, rel]) => [id, path.join(audioOut, rel)]));
  const expected = visual.expected; // { width, height, fps, duration, frames }
  const master = await probeWav(audioFile);
  const issues = checkMasterFormat(master, { ...settings.audio, duration: expected.duration, fps: expected.fps });
  if (issues.length) throw new Error(`La mezcla ${path.relative(paths.root, audioFile)} no encaja con la salida: ${issues.join("; ")}. Esta etapa no convierte formatos`);

  const outDir = path.join(dir, "output");
  const output = path.join(outDir, `${manifest.id}.mp4`);
  const reportFile = path.join(outDir, "av-report.json");
  const sources = { video: sha256(videoFile), audio: sha256(audioFile) };
  const stemHashes = Object.fromEntries(Object.entries(stems).map(([id, f]) => [id, sha256(f)]));
  const hash = avInputsHash({ manifestFile: av.file, settings, video: sources.video, audio: sources.audio, stems: stemHashes, ffmpeg: await ffmpegVersion() });

  const rel = (f) => path.relative(paths.root, f);
  const sourceInfo = {
    video: { project: visual.project, file: rel(videoFile), sha256: sources.video, buildHash: visual.buildHash, cached: Boolean(visual.cached), forced: force.video },
    audio: { project: sound.project, file: rel(audioFile), sha256: sources.audio, inputsHash: sound.inputsHash, cached: Boolean(sound.cached), forced: force.audio, format: master },
  };
  if (!force.mux && fs.existsSync(reportFile) && fs.existsSync(output)) {
    const prev = readJson(reportFile);
    if (prev.ok && prev.inputsHash === hash && prev.output?.sha256 === sha256(output)) {
      return { ...prev, sources: sourceInfo, cached: true, timings: { ...timings, total: seconds(performance.now() - t0) } };
    }
  }

  const res = await muxAndVerify({ video: videoFile, audio: audioFile, output, expected, audioSettings: settings.audio, stems, step });
  const report = {
    project: manifest.id,
    generatedAt: new Date().toISOString(),
    inputsHash: hash,
    force,
    sources: sourceInfo,
    settings,
    expected,
    mux: res.mux,
    output: { file: path.relative(dir, output), sha256: res.sha256, ...res.verification.container },
    video: res.verification.video,
    audio: res.verification.audio,
    checks: res.verification.checks,
    timings: { ...timings, total: seconds(performance.now() - t0) },
  };
  report.ok = res.ok;
  report.cached = false;
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
