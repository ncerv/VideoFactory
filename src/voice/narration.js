// Narración externa: el usuario genera la voz fuera de VideoFactory (manualmente) y entrega un WAV
// o MP3 en projects/<id>/voice/. Aquí no se genera voz: se aprueba el guion, se recibe el archivo,
// se valida, se prepara una copia de producción PCM 48 kHz estéreo y se verifica la conversión.
//
//   vf script approve <dir>   → fija la versión editorial definitiva (hash del guion y del perfil vocal)
//   vf voice ingest <dir>     → valida la narración frente al guion aprobado y crea la copia de producción
//
// El archivo original nunca se modifica (SHA-256 antes y después). La copia de producción vive en
// output/voice/ (salida regenerable); si el original ya es PCM 48 kHz estéreo, se usa tal cual.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { convertToPcmStereo, decodeAudioPcm, decodeCheck, ffmpegVersion, probe } from "../adapters/ffmpeg.js";
import { decodeWav } from "../audio/wav.js";
import { measureLag } from "../av/verify.js";
import { hashFiles, moduleGraph } from "../orchestrator/fingerprint.js";
import { paths } from "../orchestrator/paths.js";
import { validateAgainst } from "../validation/schemas.js";

export const PRODUCTION = { sampleRate: 48000, channels: 2 };
const seconds = (ms) => Math.round(ms) / 1000;
const r2 = (v) => Math.round(v * 100) / 100;
const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
export const sha256File = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const PCM_CODECS = new Set(["pcm_s16le", "pcm_s24le"]);

/** Ruta relativa dentro de `base`, o null si escapa de ella. */
function inside(base, rel) {
  const p = path.resolve(base, rel);
  const r = path.relative(base, p);
  return r && !r.startsWith("..") && !path.isAbsolute(r) ? p : null;
}

export const voiceProfilePath = (id) => path.join(paths.profiles, "voices", `${id}.md`);

/** Lee y valida narration.json y resuelve sus archivos. No exige que la voz exista todavía. */
export function loadNarration(projectDir) {
  const dir = path.resolve(projectDir);
  const file = path.join(dir, "narration.json");
  if (!fs.existsSync(file)) throw new Error(`No existe narration.json en ${dir}`);
  const manifest = readJson(file);
  const errors = validateAgainst("narration", manifest);
  if (errors.length) throw Object.assign(new Error(`narration.json no válido: ${errors.map((e) => `${e.instancePath} ${e.message}`).join("; ")}`), { errors });
  if (manifest.id !== path.basename(dir)) throw new Error(`El id "${manifest.id}" no coincide con la carpeta "${path.basename(dir)}"`);
  const scriptFile = inside(dir, manifest.script.file);
  if (!scriptFile) throw new Error(`script.file debe estar dentro del proyecto: ${manifest.script.file}`);
  const sourceFile = inside(dir, manifest.source.file);
  if (!sourceFile) throw new Error(`source.file debe estar dentro de voice/: ${manifest.source.file}`);
  const profileFile = voiceProfilePath(manifest.voiceProfile.id);
  if (!fs.existsSync(profileFile)) throw new Error(`No existe el perfil vocal profiles/voices/${manifest.voiceProfile.id}.md`);
  for (const s of manifest.segments ?? []) {
    if ((s.start === undefined) !== (s.end === undefined)) throw new Error(`Segmento ${s.id}: start y end van juntos`);
    if (s.start !== undefined && s.end <= s.start) throw new Error(`Segmento ${s.id}: end debe ser mayor que start`);
    if (s.start !== undefined && manifest.alignment !== "manual") throw new Error(`Segmento ${s.id} tiene tiempos pero alignment no es "manual": no se registran tiempos sin medirlos`);
  }
  return { dir, file, manifest, scriptFile, sourceFile, profileFile };
}

/**
 * Etapa B: el usuario aprobó el guion. Fija su hash y el del perfil vocal; desde ese momento,
 * cualquier cambio en el guion detiene la recepción de la narración hasta una nueva aprobación.
 */
export function approveScript(projectDir, { version } = {}) {
  const n = loadNarration(projectDir);
  if (!fs.existsSync(n.scriptFile)) throw new Error(`No existe el guion ${n.manifest.script.file}`);
  const text = fs.readFileSync(n.scriptFile, "utf8");
  if (!text.trim()) throw new Error("El guion está vacío");
  const m = n.manifest;
  m.script = { ...m.script, ...(version ? { version } : {}), status: "approved", sha256: sha256File(n.scriptFile), approvedAt: new Date().toISOString() };
  m.voiceProfile = { ...m.voiceProfile, sha256: sha256File(n.profileFile) };
  fs.writeFileSync(n.file, `${JSON.stringify(m, null, 2)}\n`);
  return { project: m.id, script: m.script, voiceProfile: m.voiceProfile };
}

/** Comprobaciones previas que no tocan el audio: aprobación e integridad del guion y del perfil. */
export function checkApproval(n) {
  const m = n.manifest;
  if (m.script.status !== "approved") throw new Error(`El guion ${m.script.file} (versión ${m.script.version}) no está aprobado: la recepción de voz espera a la aprobación explícita (vf script approve)`);
  if (!fs.existsSync(n.scriptFile)) throw new Error(`No existe el guion aprobado ${m.script.file}`);
  const scriptSha = sha256File(n.scriptFile);
  if (scriptSha !== m.script.sha256) throw new Error(`El guion cambió después de aprobarse (versión ${m.script.version}): la narración ya no corresponde. Revísalo y vuelve a aprobarlo`);
  const profileSha = sha256File(n.profileFile);
  if (m.voiceProfile.sha256 && profileSha !== m.voiceProfile.sha256) throw new Error(`El perfil vocal ${m.voiceProfile.id} cambió después de la aprobación`);
  return { scriptSha, profileSha };
}

/** Formato del archivo según ffprobe (primer stream de audio). */
export async function probeAudio(file) {
  const info = await probe(file);
  const s = info.streams.find((x) => x.codec_type === "audio");
  if (!s) throw new Error(`${path.basename(file)} no contiene audio`);
  const bits = Number(s.bits_per_sample) || Number(s.bits_per_raw_sample) || null;
  return {
    container: info.format.format_name,
    codec: s.codec_name,
    sampleRate: Number(s.sample_rate),
    channels: s.channels,
    channelLayout: s.channel_layout ?? null,
    bitDepth: bits,
    sampleFormat: s.sample_fmt,
    lossy: !PCM_CODECS.has(s.codec_name) && !/^pcm_|flac/.test(s.codec_name),
    bitRate: Number(s.bit_rate || info.format.bit_rate) || null,
    duration: Number(s.duration ?? info.format.duration),
    sizeBytes: Number(info.format.size),
  };
}

const rmsChannel = (c) => Math.sqrt(c.reduce((a, v) => a + v * v, 0) / (c.length || 1));
const peakOf = (chs) => chs.reduce((m, c) => c.reduce((mm, v) => Math.max(mm, Math.abs(v)), m), 0);

export const narrationModules = () => moduleGraph([fileURLToPath(import.meta.url)]);

/**
 * Etapa D: recibe la narración entregada por el usuario.
 * @param o { pin (fija source.sha256 si no estaba), force, onStep }
 * @returns informe (también en output/voice/narration-report.json)
 */
export async function ingestNarration(projectDir, { pin = false, force = false, onStep = () => {} } = {}) {
  const t0 = performance.now();
  const timings = {};
  const step = async (name, fn) => {
    onStep(name);
    const s = performance.now();
    const r = await fn();
    timings[name] = seconds(performance.now() - s);
    return r;
  };
  const n = await step("load", () => loadNarration(projectDir));
  const m = n.manifest;
  const { scriptSha, profileSha } = checkApproval(n);
  if (!fs.existsSync(n.sourceFile)) throw new Error(`Falta la narración ${m.source.file}: genérala manualmente con el guion aprobado y el perfil ${m.voiceProfile.id}, y guárdala en voice/`);

  const sourceSha = sha256File(n.sourceFile);
  if (m.source.sha256 && m.source.sha256 !== sourceSha) {
    throw new Error(`La narración ${m.source.file} no es la que se fijó (SHA-256 distinto). Si es una nueva versión aceptada, borra source.sha256 en narration.json y vuelve a fijarla con --pin`);
  }
  if (pin && !m.source.sha256) {
    m.source = { ...m.source, sha256: sourceSha };
    fs.writeFileSync(n.file, `${JSON.stringify(m, null, 2)}\n`);
  }

  const outDir = path.join(n.dir, "output", "voice");
  const reportFile = path.join(outDir, "narration-report.json");
  const h = createHash("sha256").update(JSON.stringify({ sourceSha, scriptSha, profileSha, ffmpeg: await ffmpegVersion() }));
  hashFiles(h, narrationModules());
  const hash = h.digest("hex").slice(0, 16);
  if (!force && fs.existsSync(reportFile)) {
    const prev = readJson(reportFile);
    const prodFile = prev.production && path.join(n.dir, prev.production.file);
    if (prev.ok && prev.inputsHash === hash && prodFile && fs.existsSync(prodFile) && sha256File(prodFile) === prev.production.sha256) {
      return { ...prev, pinned: Boolean(m.source.sha256), cached: true, timings: { ...timings, total: seconds(performance.now() - t0) } };
    }
  }

  const checks = [];
  const add = (name, ok, detail, level = "error") => checks.push({ name, ok: Boolean(ok), level, detail });
  const source = await step("probe", () => probeAudio(n.sourceFile));
  const decodable = await step("decode", () => decodeCheck(n.sourceFile));
  add("fuente:decodifica", decodable.ok, decodable.ok ? "decodificación completa sin errores" : decodable.errors.slice(0, 300));
  if (!decodable.ok) throw Object.assign(new Error(`${m.source.file} no se puede decodificar: ${decodable.errors.slice(0, 300)}`), { checks });
  add("fuente:canales", source.channels === 1 || source.channels === 2, `${source.channels} canales (se admiten mono o estéreo)`);
  if (source.channels > 2) throw Object.assign(new Error(`${source.channels} canales: entrega la narración en mono o estéreo`), { checks });

  // Muestras de la fuente a su frecuencia nativa (MP3: el decodificador aplica el retardo/relleno sin pausas).
  const src = await step("decodeSource", () => decodeAudioPcm(n.sourceFile, { channels: source.channels, sampleRate: source.sampleRate }));
  const srcFrames = src[0].length;
  const srcPeak = peakOf(src);
  if (srcPeak >= 0.9999) add("fuente:fondo-de-escala", false, `la fuente ya llega a fondo de escala (pico ${r2(db(srcPeak))} dBFS): puede estar recortada de origen`, "warning");

  const compliant = source.container === "wav" && PCM_CODECS.has(source.codec) && source.sampleRate === PRODUCTION.sampleRate && source.channels === PRODUCTION.channels;
  fs.mkdirSync(outDir, { recursive: true });
  let productionFile = n.sourceFile;
  let conversion = { converted: false, reason: "la fuente ya es PCM 48 kHz estéreo: se usa sin copiar" };
  if (!compliant) {
    productionFile = path.join(outDir, "narration-48k.wav");
    const tmp = `${productionFile}.partial.wav`;
    const conv = await step("convert", () => convertToPcmStereo({ input: n.sourceFile, output: tmp, inputSampleRate: source.sampleRate, inputChannels: source.channels, sampleRate: PRODUCTION.sampleRate }));
    fs.renameSync(tmp, productionFile);
    conversion = { converted: true, resampler: conv.resampler, channelMap: conv.channelMap, bitDepth: 24, args: conv.args };
  }

  // Verificación de la copia de producción.
  const prodProbe = await probeAudio(productionFile);
  add("produccion:formato", PCM_CODECS.has(prodProbe.codec) && prodProbe.sampleRate === PRODUCTION.sampleRate && prodProbe.channels === PRODUCTION.channels, `${prodProbe.codec} · ${prodProbe.sampleRate} Hz · ${prodProbe.channels} canales · ${prodProbe.bitDepth} bits`);
  const prod = await step("verify", () => decodeWav(fs.readFileSync(productionFile)));
  const expectedFrames = Math.round((srcFrames * PRODUCTION.sampleRate) / source.sampleRate);
  const tol = Math.max(2, Math.ceil(PRODUCTION.sampleRate / source.sampleRate));
  add("produccion:duracion", Math.abs(prod.frames - expectedFrames) <= tol, `${prod.frames} muestras = ${(prod.frames / PRODUCTION.sampleRate).toFixed(4)} s (esperadas ${expectedFrames} ±${tol}; fuente ${srcFrames} a ${source.sampleRate} Hz = ${(srcFrames / source.sampleRate).toFixed(4)} s)`);
  add("produccion:clipping", prod.fullScaleSamples === 0, prod.fullScaleSamples ? `${prod.fullScaleSamples} muestras a fondo de escala tras la conversión: la fuente no deja margen para el remuestreo (no se cambia la ganancia sin decisión expresa)` : `sin recortes · pico ${r2(db(peakOf(prod.channels)))} dBFS (fuente ${r2(db(srcPeak))} dBFS)`);
  const levels = prod.channels.map((c, k) => r2(db(rmsChannel(c)) - db(rmsChannel(src[source.channels === 1 ? 0 : k]))));
  add("produccion:nivel", levels.every((d) => Math.abs(d) < 0.1), `diferencia de RMS por canal ${levels.map((d) => `${d >= 0 ? "+" : ""}${d} dB`).join(" / ")} (sin cambio de ganancia)`);
  if (source.channels === 1) add("produccion:mono-duplicado", prod.channels[0].every((v, i) => v === prod.channels[1][i]), "los dos canales son idénticos (fuente mono)");
  if (conversion.converted) {
    // Desfase frente a la fuente remuestreada por otra vía (remuestreador por defecto de FFmpeg).
    const ref = await decodeAudioPcm(n.sourceFile, { channels: 2, sampleRate: PRODUCTION.sampleRate });
    const lag = measureLag(ref, prod.channels, { maxLag: 960, window: 9600 });
    add("produccion:sincronia", lag.lag === 0 && lag.correlation > 0.99, `desfase ${lag.lag} muestras · correlación ${lag.correlation}`);
  }
  const unchanged = sha256File(n.sourceFile) === sourceSha;
  add("fuente:intacta", unchanged, unchanged ? "SHA-256 del original igual antes y después" : "¡el original cambió durante la recepción!");

  const rel = (f) => path.relative(n.dir, f);
  const report = {
    project: m.id,
    generatedAt: new Date().toISOString(),
    inputsHash: hash,
    script: { file: m.script.file, version: m.script.version, sha256: scriptSha, approvedAt: m.script.approvedAt ?? null },
    voiceProfile: { id: m.voiceProfile.id, file: path.relative(paths.root, n.profileFile), sha256: profileSha },
    source: { file: m.source.file, generator: m.source.generator ?? null, sha256: sourceSha, ...source, samples: srcFrames, peakDb: r2(db(srcPeak)) },
    production: { file: rel(productionFile), sha256: sha256File(productionFile), sampleRate: PRODUCTION.sampleRate, channels: PRODUCTION.channels, bitDepth: prodProbe.bitDepth, samples: prod.frames, duration: prod.frames / PRODUCTION.sampleRate, ...conversion },
    alignment: m.alignment ?? "none",
    segments: (m.segments ?? []).length,
    checks,
    timings: { ...timings, total: seconds(performance.now() - t0) },
  };
  report.ok = checks.every((c) => c.ok || c.level === "warning");
  report.pinned = Boolean(m.source.sha256);
  report.cached = false;
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok && conversion.converted) fs.rmSync(productionFile, { force: true }); // una copia que no supera las comprobaciones no se deja disponible
  return report;
}
