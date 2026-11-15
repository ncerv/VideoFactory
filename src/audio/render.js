// `vf audio render`: composición procedural → stems y mezcla WAV, deterministas y verificados.
//
// Flujo: audio.json + timing.json + audio.js → un Tone.Offline por stem (cada uno con su propio
// espacio de reverberación) → ducking opcional por segmentos de voz → mezcla = suma lineal de stems
// → fades y techo de pico aplicados igual a mezcla y stems (así Σ stems = mezcla) → WAV PCM con
// dither TPDF con semilla → verificación → output/audio-report.json.
// Si las entradas (manifiestos, composición, generadores, motor y versiones) no cambian y la salida
// existe y fue correcta, no se vuelve a renderizar.
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as library from "../../library/audio/index.js";
import { hashFiles, moduleGraph } from "../orchestrator/fingerprint.js";
import { createRng } from "../rendering/prng.js";
import { validateAgainst } from "../validation/schemas.js";
import { analyze, applyFades, duckingEnvelope, multiply, noiseStereo, scale, sum } from "./dsp.js";
import { dbToGain, gainToDb, loadTone, withDeterminismGuard } from "./runtime.js";
import { verifyAudioOutput } from "./verify.js";
import { encodeWav } from "./wav.js";

const require = createRequire(import.meta.url);
const seconds = (ms) => Math.round(ms) / 1000;
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const stringHash = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

/** Versión instalada de un paquete, aunque no exporte su package.json. */
export function packageVersion(pkg) {
  let dir = path.dirname(require.resolve(pkg));
  while (dir !== path.dirname(dir)) {
    const file = path.join(dir, "package.json");
    if (fs.existsSync(file)) {
      const json = readJson(file);
      if (json.name === pkg) return json.version;
    }
    dir = path.dirname(dir);
  }
  throw new Error(`No se encuentra la versión de ${pkg}`);
}

/** Carga y valida audio.json, timing.json y el módulo de composición. */
export async function loadAudioProject(projectDir) {
  const dir = path.resolve(projectDir);
  const manifestFile = path.join(dir, "audio.json");
  if (!fs.existsSync(manifestFile)) throw new Error(`No existe audio.json en ${dir}`);
  const manifest = readJson(manifestFile);
  const errors = validateAgainst("audioProject", manifest);
  if (errors.length) throw Object.assign(new Error(`audio.json no válido: ${errors.map((e) => `${e.instancePath} ${e.message}`).join("; ")}`), { errors });
  if (manifest.id !== path.basename(dir)) throw new Error(`El id "${manifest.id}" no coincide con la carpeta "${path.basename(dir)}"`);
  const timingFile = path.join(dir, manifest.timing ?? "timing.json");
  const timing = fs.existsSync(timingFile) ? readJson(timingFile) : {};
  if (!(timing.duration > 0)) throw new Error("timing.json debe definir duration (segundos)");
  const sourceFile = path.join(dir, manifest.source);
  const mod = await import(pathToFileURL(sourceFile).href);
  if (typeof mod.default !== "function") throw new Error(`${manifest.source} debe exportar por defecto una función de composición`);
  return { dir, manifest, timing, timingFile, sourceFile, compose: mod.default };
}

/**
 * Hash de todo lo que determina el resultado: si no cambia, el audio tampoco.
 * Solo entradas funcionales: audio.json, timing.json, el grafo de módulos de la composición (relativo
 * al proyecto), el grafo de módulos del motor desde este archivo (generadores, DSP, WAV, PRNG,
 * verificación) y las versiones de tone y node-web-audio-api. La documentación no cuenta.
 */
export function inputsHash({ dir, manifest, timingFile, sourceFile }) {
  const h = createHash("sha256");
  const add = (label, file) => h.update(`${label}\0`).update(fs.readFileSync(file)).update("\0");
  add("audio.json", path.join(dir, "audio.json"));
  if (fs.existsSync(timingFile)) add("timing", timingFile);
  h.update("project-modules\0");
  hashFiles(h, moduleGraph([sourceFile]), dir);
  h.update("engine-modules\0");
  hashFiles(h, engineModules());
  for (const pkg of ["tone", "node-web-audio-api"]) h.update(`${pkg}@${packageVersion(pkg)}\0`);
  h.update(JSON.stringify(manifest.format));
  return h.digest("hex").slice(0, 16);
}

/** Módulos del motor de audio que intervienen en un render (grafo de imports desde este archivo). */
export const engineModules = () => moduleGraph([fileURLToPath(import.meta.url)]);

/** Renderiza un stem con Tone.Offline y devuelve sus canales Float32. */
async function renderStem(Tone, stem, { duration, sampleRate, channels, timing, seed }) {
  const buffer = await withDeterminismGuard(() =>
    Tone.Offline(
      async () => {
        const out = new Tone.Gain(dbToGain(stem.gainDb ?? 0)).toDestination();
        const ctx = {
          Tone,
          lib: library,
          out,
          duration,
          sampleRate,
          timing,
          rng: createRng(seed ^ stringHash(stem.id)),
          noise: (kind, secs, s = 1) => Tone.ToneAudioBuffer.fromArray(noiseStereo(kind, secs, sampleRate, (seed + s) >>> 0)),
        };
        await stem.build(ctx);
      },
      duration,
      channels,
      sampleRate,
    ),
  );
  // Tone.Offline trunca duration × sampleRate: se ajusta al número exacto de muestras esperado
  // (round), rellenando con silencio o recortando la última muestra si hace falta.
  const frames = Math.round(duration * sampleRate);
  return Array.from({ length: buffer.numberOfChannels }, (_, c) => {
    const data = buffer.getChannelData(c);
    const out = new Float32Array(frames);
    out.set(data.subarray(0, Math.min(frames, data.length)));
    return out;
  });
}

/**
 * @param o { force, outputDir, onStep }
 * @returns informe (también en <output>/audio-report.json); cached: true si no hizo falta renderizar
 */
export async function renderAudioProject(projectDir, { force = false, outputDir = null, onStep = () => {} } = {}) {
  const t0 = performance.now();
  const timings = {};
  const step = async (name, fn) => {
    onStep(name);
    const s = performance.now();
    const r = await fn();
    timings[name] = seconds(performance.now() - s);
    return r;
  };

  const loaded = await step("load", () => loadAudioProject(projectDir));
  const { dir, manifest, timing, compose } = loaded;
  const hash = inputsHash(loaded);
  const outDir = outputDir ? path.resolve(outputDir) : path.join(dir, "output");
  const reportFile = path.join(outDir, "audio-report.json");
  if (!force && fs.existsSync(reportFile)) {
    const prev = readJson(reportFile);
    const filesOk = prev.files && [prev.files.mix, ...Object.values(prev.files.stems ?? {})].every((f) => fs.existsSync(path.join(outDir, f)));
    if (prev.ok && prev.inputsHash === hash && filesOk) return { ...prev, cached: true, timings: { ...timings, total: seconds(performance.now() - t0) } };
  }

  const { sampleRate, bitDepth, channels } = manifest.format;
  const duration = timing.duration;
  const seed = timing.seed ?? 1;
  const composition = compose({ duration, sampleRate, timing, lib: library });
  if (!composition?.stems?.length) throw new Error("La composición no define stems");
  const ids = composition.stems.map((s) => s.id);
  if (new Set(ids).size !== ids.length) throw new Error("Hay stems con id repetido");

  const Tone = await step("loadTone", () => loadTone());
  const stems = [];
  for (const stem of composition.stems) {
    const data = await step(`stem:${stem.id}`, () => renderStem(Tone, stem, { duration, sampleRate, channels, timing, seed }));
    stems.push({ ...stem, data });
  }

  // Ducking por voz (subsistema independiente): solo actúa si hay segmentos declarados.
  const voice = manifest.voice ?? {};
  const segments = voice.segments ?? [];
  if (segments.length) {
    const roles = voice.ducking?.roles ?? ["music", "ambience"];
    const env = duckingEnvelope(stems[0].data[0].length, sampleRate, segments, voice.ducking ?? {});
    for (const s of stems) if (roles.includes(s.role ?? "music")) multiply(s.data, env);
  }

  // Mezcla lineal + master idéntico para mezcla y stems.
  const mix = sum(stems.map((s) => s.data));
  const fades = { fadeIn: manifest.master.fadeIn, fadeOut: manifest.master.fadeOut };
  applyFades(mix, sampleRate, fades);
  for (const s of stems) applyFades(s.data, sampleRate, fades);
  const ceiling = dbToGain(manifest.master.ceilingDb);
  const prePeak = analyze(mix, sampleRate).peak;
  const masterGain = prePeak > ceiling ? ceiling / prePeak : 1;
  scale(mix, masterGain);
  for (const s of stems) scale(s.data, masterGain);

  fs.mkdirSync(outDir, { recursive: true });
  const files = { mix: "mix.wav", stems: {} };
  const encoded = {};
  await step("encode", () => {
    const write = (rel, data, ditherSeed) => {
      const { buffer, clipped } = encodeWav(data, { sampleRate, bitDepth, ditherSeed });
      fs.mkdirSync(path.dirname(path.join(outDir, rel)), { recursive: true });
      fs.writeFileSync(path.join(outDir, rel), buffer);
      encoded[rel] = { clipped, sha256: createHash("sha256").update(buffer).digest("hex") };
    };
    write(files.mix, mix, seed);
    if (manifest.stems !== false) {
      stems.forEach((s, i) => {
        files.stems[s.id] = `stems/${s.id}.wav`;
        write(files.stems[s.id], s.data, seed + i + 1);
      });
    }
  });

  const verification = await step("verify", () =>
    verifyAudioOutput({ outDir, files, expected: { sampleRate, bitDepth, channels, duration, frames: Math.round(duration * sampleRate) }, ceilingDb: manifest.master.ceilingDb, fades, projectDir: dir, sources: [loaded.sourceFile] }),
  );

  const report = {
    project: manifest.id,
    generatedAt: new Date().toISOString(),
    inputsHash: hash,
    engine: { tone: Tone.version, nodeWebAudioApi: packageVersion("node-web-audio-api") },
    format: manifest.format,
    duration,
    stems: stems.map((s) => ({ id: s.id, role: s.role ?? "music", gainDb: s.gainDb ?? 0, ...analyze(s.data, sampleRate) })),
    master: { ...manifest.master, prePeakDb: Math.round(gainToDb(prePeak) * 100) / 100, gainDb: Math.round(gainToDb(masterGain) * 100) / 100 },
    voice: { segments: segments.length },
    encoded,
    verification,
    timings: { ...timings, total: seconds(performance.now() - t0) },
    files,
  };
  report.ok = verification.ok && Object.values(encoded).every((e) => e.clipped === 0);
  report.cached = false;
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
