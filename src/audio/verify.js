// Verificación de los WAV exportados: formato (ffprobe), muestras (pico, clipping, continua, fades),
// sonoridad (FFmpeg ebur128) y ausencia de recursos de audio externos.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { resolveBinary } from "../adapters/ffmpeg.js";
import { paths } from "../orchestrator/paths.js";
import { analyze, bandEnergy, REFERENCE_BANDS } from "./dsp.js";
import { decodeWav } from "./wav.js";

function run(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

/** Formato del WAV según ffprobe. */
export async function probeWav(file) {
  const { code, stdout, stderr } = await run(resolveBinary("ffprobe"), [
    "-v", "error", "-select_streams", "a:0",
    "-show_entries", "stream=codec_name,sample_rate,channels,bits_per_sample,duration_ts,duration:format=format_name,size",
    "-of", "json", file,
  ]);
  if (code !== 0) throw new Error(`ffprobe: ${stderr.trim()}`);
  const info = JSON.parse(stdout);
  const s = info.streams[0];
  return {
    codec: s.codec_name,
    sampleRate: Number(s.sample_rate),
    channels: s.channels,
    bitDepth: s.bits_per_sample,
    frames: Number(s.duration_ts),
    duration: Number(s.duration),
    container: info.format.format_name,
    sizeBytes: Number(info.format.size),
  };
}

/** Sonoridad integrada (LUFS) y pico verdadero (dBTP) con el filtro ebur128 de FFmpeg. */
export async function loudness(file) {
  const { code, stderr } = await run(resolveBinary("ffmpeg"), ["-hide_banner", "-nostats", "-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"]);
  if (code !== 0) return null;
  const summary = stderr.slice(stderr.lastIndexOf("Summary:"));
  const num = (re) => {
    const m = summary.match(re);
    return m ? Number(m[1]) : null;
  };
  return { integratedLufs: num(/I:\s+(-?[\d.]+) LUFS/), loudnessRangeLu: num(/LRA:\s+(-?[\d.]+) LU/), truePeakDb: num(/Peak:\s+(-?[\d.]+) dBFS/) };
}

/**
 * Imagen de revisión (forma de onda + espectrograma lineal hasta 6 kHz): permite revisar la
 * estructura de una mezcla sin escucharla. Es orientativa; las medidas objetivas son las de bandEnergy.
 */
export async function reviewImage(input, output) {
  const graph = "[0]asplit[a][b];[a]showspectrumpic=s=1400x480:mode=combined:scale=log:fscale=lin:stop=6000:legend=1:color=intensity,scale=1600:-2[s];[b]showwavespic=s=1600x200:colors=0x9fd3c7[w];[s][w]vstack=inputs=2";
  const { code } = await run(resolveBinary("ffmpeg"), ["-v", "error", "-y", "-i", input, "-filter_complex", graph, "-frames:v", "1", output]);
  return code === 0;
}

const AUDIO_EXT = /\.(wav|mp3|ogg|oga|flac|aiff?|m4a|aac|opus|webm|caf|sf2|sfz)$/i;

/**
 * Auditoría de recursos externos: ni archivos de audio en la biblioteca o el proyecto (fuera de output/)
 * ni cargas de URLs/archivos en el código de composición y generadores.
 */
export function auditAudioSources({ projectDir, sources = [] }) {
  const findings = [];
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      if (e.name === "output" || e.name.startsWith(".")) return [];
      const p = path.join(dir, e.name);
      return e.isDirectory() ? walk(p) : [p];
    });
  const scanned = [...walk(projectDir), ...walk(path.join(paths.library, "audio"))];
  for (const f of scanned) if (AUDIO_EXT.test(f)) findings.push({ kind: "audio-file", value: path.relative(paths.root, f) });
  const code = [...new Set([...sources, ...scanned.filter((f) => /\.m?js$/.test(f))])];
  for (const f of code) {
    const src = fs.readFileSync(f, "utf8");
    for (const [re, kind] of [
      [/https?:\/\//, "url"],
      [/\bfetch\s*\(/, "fetch"],
      [/new\s+Tone\.(Player|Players|Sampler|GrainPlayer)\s*\(/, "sample-player"],
      [/ToneAudioBuffer\s*\(\s*["'`]|\.load\s*\(\s*["'`]/, "buffer-load"],
      [/decodeAudioData\s*\(/, "decode"],
    ]) {
      if (re.test(src)) findings.push({ kind, value: path.relative(paths.root, f) });
    }
  }
  return { ok: findings.length === 0, scannedFiles: scanned.length, findings };
}

/** Verifica mezcla y stems frente a lo esperado. */
export async function verifyAudioOutput({ outDir, files, expected, ceilingDb, fades, projectDir, sources }) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });
  const all = [files.mix, ...Object.values(files.stems ?? {})];
  const probes = {};
  for (const rel of all) {
    const p = await probeWav(path.join(outDir, rel));
    probes[rel] = p;
    add(`${rel}:formato`, p.codec === `pcm_s${expected.bitDepth}le` && p.sampleRate === expected.sampleRate && p.channels === expected.channels && p.bitDepth === expected.bitDepth, `${p.codec} · ${p.sampleRate} Hz · ${p.bitDepth} bits · ${p.channels} canales`);
    add(`${rel}:duracion`, p.frames === expected.frames, `${p.frames} muestras = ${p.duration.toFixed(4)} s (esperado ${expected.frames})`);
  }
  const mix = decodeWav(fs.readFileSync(path.join(outDir, files.mix)));
  const stats = analyze(mix.channels, mix.sampleRate, { edge: 0.05 });
  const ceiling = 10 ** (ceilingDb / 20);
  add("mix:clipping", mix.fullScaleSamples === 0, `${mix.fullScaleSamples} muestras a fondo de escala`);
  add("mix:techo", stats.peak <= ceiling + 2 / 32768, `pico ${stats.peakDb} dBFS (techo ${ceilingDb} dBFS)`);
  add("mix:continua", Math.abs(stats.dcOffset) < 0.002, `DC ${stats.dcOffset.toExponential(2)}`);
  if (fades.fadeIn > 0) add("mix:fade-in", stats.firstSample <= 3 / 32768 && stats.headRmsDb < stats.rmsDb - 12, `1.ª muestra ${stats.firstSample.toExponential(1)} · RMS inicial ${stats.headRmsDb} dB vs ${stats.rmsDb} dB`);
  if (fades.fadeOut > 0) add("mix:fade-out", stats.lastSample <= 3 / 32768 && stats.tailRmsDb < stats.rmsDb - 12, `última muestra ${stats.lastSample.toExponential(1)} · RMS final ${stats.tailRmsDb} dB`);
  const lufs = await loudness(path.join(outDir, files.mix));
  const spectrum = bandEnergy(mix.channels, mix.sampleRate, REFERENCE_BANDS);
  const review = await reviewImage(path.join(outDir, files.mix), path.join(outDir, "review.png"));
  const audit = auditAudioSources({ projectDir, sources });
  add("recursos-externos", audit.ok, `${audit.findings.length} hallazgos en ${audit.scannedFiles} archivos`);
  return { ok: checks.every((c) => c.ok), checks, probes, mix: stats, loudness: lufs, spectrum, voiceBandDb: spectrum["300-3000"], externalResources: audit, review: review ? "review.png" : null };
}
