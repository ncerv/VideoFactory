// `vf av render`: integración audiovisual de un proyecto visual y uno de audio.
//
// Flujo: av.json → vf render del proyecto visual y vf audio render del de audio (ambos con su propia
// caché: si sus entradas no cambiaron, no se vuelve a renderizar) → comprobación de que las fuentes
// encajan (duración) → FFmpeg: vídeo H.264 copiado + mezcla WAV a AAC, sin filtros ni cambios de
// ganancia → verificación → output/av-report.json.
// Los proyectos fuente no se modifican: solo se leen sus salidas, y se comprueba con SHA-256 que
// el multiplexado no las altera. Si las fuentes, av.json, el código de integración y FFmpeg no
// cambian y la salida existente fue correcta, no se vuelve a multiplexar.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ffmpegVersion, muxAudioVideo } from "../adapters/ffmpeg.js";
import { renderAudioProject } from "../audio/render.js";
import { paths } from "../orchestrator/paths.js";
import { renderProject } from "../rendering/render-project.js";
import { validateAgainst } from "../validation/schemas.js";
import { verifyAvOutput } from "./verify.js";

const seconds = (ms) => Math.round(ms) / 1000;
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const sha256 = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
export const AV_DEFAULTS = { quality: "looks", audio: { codec: "aac", bitrate: "192k", sampleRate: 48000, channels: 2 } };

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
  const audioDir = resolveSource(manifest.audio.project, "audio.project", "audio.json");
  const settings = {
    quality: manifest.video.quality ?? AV_DEFAULTS.quality,
    audio: { ...AV_DEFAULTS.audio, ...(manifest.output?.audio ?? {}) },
  };
  return { dir, file, manifest, videoDir, audioDir, settings };
}

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listFiles(path.join(dir, e.name)) : [path.join(dir, e.name)])).sort();
}

/** Huella de todo lo que determina el MP4: fuentes, manifiesto, código de integración y FFmpeg. */
export function avInputsHash({ manifestFile, video, audio, ffmpeg }) {
  const h = createHash("sha256");
  h.update("av.json\0").update(fs.readFileSync(manifestFile));
  h.update(`video\0${video}\0audio\0${audio}\0${ffmpeg}\0`);
  for (const f of [...listFiles(path.join(paths.root, "src", "av")), path.join(paths.root, "src", "adapters", "ffmpeg.js")]) h.update(`${path.relative(paths.root, f)}\0`).update(fs.readFileSync(f));
  return h.digest("hex").slice(0, 16);
}

/**
 * Multiplexa y verifica (sin tocar las fuentes). Separado del render de los proyectos fuente
 * para poder probarlo con entradas sintéticas.
 * @returns { ok, mux, verification, inputs }
 */
export async function muxAndVerify({ video, audio, output, expected, audioSettings = AV_DEFAULTS.audio, step = (_n, fn) => fn() }) {
  const before = { video: sha256(video), audio: sha256(audio) };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const tmp = `${output}.partial.mp4`;
  const mux = await step("mux", () => muxAudioVideo({ video, audio, output: tmp, ...audioSettings }));
  fs.renameSync(tmp, output);
  const verification = await step("verify", () => verifyAvOutput({ file: output, sourceVideo: video, sourceAudio: audio, expected: { ...expected, sampleRate: audioSettings.sampleRate, channels: audioSettings.channels, audioCodec: audioSettings.codec } }));
  const after = { video: sha256(video), audio: sha256(audio) };
  const unchanged = before.video === after.video && before.audio === after.audio;
  verification.checks.push({ name: "fuentes-intactas", ok: unchanged, detail: unchanged ? "SHA-256 del MP4 visual y del WAV iguales antes y después" : "una fuente cambió durante la integración" });
  verification.ok = verification.ok && unchanged;
  return { ok: verification.ok, mux, verification, inputs: { videoSha256: after.video, audioSha256: after.audio }, sha256: sha256(output) };
}

/**
 * @param o { force (solo el multiplexado), onStep(name) }
 * @returns informe (también en output/av-report.json); cached: true si no hizo falta multiplexar
 */
export async function renderAvProject(projectDir, { force = false, onStep = () => {} } = {}) {
  const t0 = performance.now();
  const timings = {};
  const step = async (name, fn) => {
    onStep(name);
    const s = performance.now();
    const r = await fn();
    timings[name] = seconds(performance.now() - s);
    return r;
  };

  const av = await step("load", () => loadAvProject(projectDir));
  const { dir, manifest, videoDir, audioDir, settings } = av;
  const sub = (prefix) => (name) => onStep(`${prefix}:${name}`);

  // Fuentes: cada proyecto conserva su flujo y su caché. --force no se propaga a ellas.
  const visual = await step("video", () => renderProject(videoDir, { quality: settings.quality, onStep: sub("video") }));
  if (!visual.ok) throw new Error(`El render visual de ${visual.project} no es correcto`);
  const sound = await step("audio", () => renderAudioProject(audioDir, { onStep: sub("audio") }));
  if (!sound.ok) throw new Error(`El render de audio de ${sound.project} no es correcto`);

  const videoFile = path.join(videoDir, visual.files.video);
  const audioFile = path.join(audioDir, "output", sound.files.mix);
  const expected = visual.expected; // { width, height, fps, duration, frames }
  if (Math.abs(sound.duration - expected.duration) > 1 / expected.fps) throw new Error(`Las duraciones no coinciden: vídeo ${expected.duration} s, audio ${sound.duration} s`);
  if (sound.format.sampleRate !== settings.audio.sampleRate || sound.format.channels !== settings.audio.channels) {
    throw new Error(`La mezcla es ${sound.format.sampleRate} Hz/${sound.format.channels} canales y la salida pide ${settings.audio.sampleRate} Hz/${settings.audio.channels}: no se remuestrea en esta etapa`);
  }

  const outDir = path.join(dir, "output");
  const output = path.join(outDir, `${manifest.id}.mp4`);
  const reportFile = path.join(outDir, "av-report.json");
  const sources = { video: sha256(videoFile), audio: sha256(audioFile) };
  const hash = avInputsHash({ manifestFile: av.file, video: sources.video, audio: sources.audio, ffmpeg: await ffmpegVersion() });

  if (!force && fs.existsSync(reportFile) && fs.existsSync(output)) {
    const prev = readJson(reportFile);
    if (prev.ok && prev.inputsHash === hash && prev.output?.sha256 === sha256(output)) {
      return { ...prev, cached: true, timings: { ...timings, total: seconds(performance.now() - t0) } };
    }
  }

  const res = await muxAndVerify({ video: videoFile, audio: audioFile, output, expected, audioSettings: settings.audio, step });
  const rel = (f) => path.relative(paths.root, f);
  const report = {
    project: manifest.id,
    generatedAt: new Date().toISOString(),
    inputsHash: hash,
    sources: {
      video: { project: visual.project, file: rel(videoFile), sha256: sources.video, buildHash: visual.buildHash, cached: Boolean(visual.cached) },
      audio: { project: sound.project, file: rel(audioFile), sha256: sources.audio, inputsHash: sound.inputsHash, cached: Boolean(sound.cached) },
    },
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
