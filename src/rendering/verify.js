// Verificación de un render: especificación técnica (ffprobe), continuidad del movimiento
// (diferencia entre fotogramas consecutivos con FFmpeg) y auditoría estática de recursos externos.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { resolveBinary } from "../adapters/ffmpeg.js";

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

const parseRate = (r) => {
  const [a, b] = String(r).split("/").map(Number);
  return b ? a / b : a;
};

/** Datos del stream de vídeo, contando los fotogramas reales (-count_frames). */
export async function probeVideo(file) {
  const ffprobe = resolveBinary("ffprobe");
  const { code, stdout, stderr } = await run(ffprobe, [
    "-v", "error", "-count_frames", "-select_streams", "v:0",
    "-show_entries", "stream=codec_name,profile,pix_fmt,width,height,r_frame_rate,avg_frame_rate,nb_read_frames,duration:format=duration,size,bit_rate,format_name",
    "-of", "json", file,
  ]);
  if (code !== 0) throw new Error(`ffprobe: ${stderr.trim()}`);
  const info = JSON.parse(stdout);
  const s = info.streams[0];
  return {
    codec: s.codec_name,
    profile: s.profile,
    pixFmt: s.pix_fmt,
    width: s.width,
    height: s.height,
    fps: parseRate(s.r_frame_rate),
    avgFps: parseRate(s.avg_frame_rate),
    frames: Number(s.nb_read_frames),
    duration: Number(info.format.duration),
    sizeBytes: Number(info.format.size),
    bitRate: Number(info.format.bit_rate),
    container: info.format.format_name,
  };
}

/** Compara la especificación esperada con la medida. */
export function checkSpec(probe, expected) {
  const checks = [
    ["width", probe.width === expected.width, `${probe.width} (esperado ${expected.width})`],
    ["height", probe.height === expected.height, `${probe.height} (esperado ${expected.height})`],
    ["fps", Math.abs(probe.fps - expected.fps) < 1e-6 && Math.abs(probe.avgFps - expected.fps) < 1e-3, `${probe.fps} (esperado ${expected.fps})`],
    ["frames", probe.frames === expected.frames, `${probe.frames} (esperado ${expected.frames})`],
    ["duration", Math.abs(probe.duration - expected.duration) <= 1 / expected.fps, `${probe.duration.toFixed(3)} s (esperado ${expected.duration} s)`],
    ["codec", probe.codec === "h264", probe.codec],
    ["pixFmt", probe.pixFmt === "yuv420p", probe.pixFmt],
  ];
  return checks.map(([name, ok, detail]) => ({ name, ok, detail }));
}

/**
 * Continuidad: diferencia media de luminancia entre fotogramas consecutivos.
 * Detecta saltos (picos muy por encima de la mediana) y congelaciones (tramos sin cambio).
 */
export async function checkContinuity(file, { spikeFactor = 6, spikeFloor = 1.5, frozenRun = 15 } = {}) {
  const ffmpeg = resolveBinary("ffmpeg");
  const { code, stdout, stderr } = await run(ffmpeg, [
    "-v", "error", "-i", file,
    "-vf", "tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-",
    "-f", "null", "-",
  ]);
  if (code !== 0) throw new Error(`ffmpeg (continuidad): ${stderr.trim()}`);
  const diffs = [...stdout.matchAll(/lavfi\.signalstats\.YAVG=([\d.]+)/g)].map((m) => Number(m[1]));
  const sorted = [...diffs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const threshold = Math.max(spikeFloor, median * spikeFactor);
  const spikes = diffs.map((d, i) => ({ frame: i + 1, diff: d })).filter((x) => x.diff > threshold);
  let run0 = 0;
  let longestFrozen = 0;
  for (const d of diffs) {
    run0 = d < 0.01 ? run0 + 1 : 0;
    longestFrozen = Math.max(longestFrozen, run0);
  }
  const round = (v) => Math.round(v * 1000) / 1000;
  return {
    pairs: diffs.length,
    meanDiff: round(diffs.reduce((a, b) => a + b, 0) / (diffs.length || 1)),
    medianDiff: round(median),
    maxDiff: round(sorted[sorted.length - 1] ?? 0),
    spikeThreshold: round(threshold),
    spikes,
    longestFrozenRun: longestFrozen,
    ok: spikes.length === 0 && longestFrozen < frozenRun,
  };
}

/**
 * Auditoría estática de la composición generada: ningún recurso externo
 * (http/https, rutas absolutas o <img>/imágenes de fondo que no sean data: o gradientes).
 */
export function auditExternalResources(buildDir) {
  const findings = [];
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return e.name.startsWith(".") ? [] : walk(p);
      return [p];
    });
  const files = walk(buildDir);
  for (const file of files.filter((f) => f.endsWith(".html"))) {
    const html = fs.readFileSync(file, "utf8");
    const rel = path.relative(buildDir, file);
    for (const m of html.matchAll(/\b(?:src|href|xlink:href)\s*=\s*["']([^"']+)["']/gi)) {
      const url = m[1];
      if (/^(https?:)?\/\//i.test(url) || url.startsWith("/")) findings.push({ file: rel, kind: "external-url", value: url });
    }
    for (const m of html.matchAll(/url\(\s*["']?([^"')]+)/gi)) {
      const url = m[1].trim();
      if (!url.startsWith("#") && !url.startsWith("data:")) findings.push({ file: rel, kind: "css-url", value: url });
    }
    if (/<img\b/i.test(html)) findings.push({ file: rel, kind: "img-tag", value: "<img>" });
    if (/<image\b/i.test(html)) findings.push({ file: rel, kind: "svg-image", value: "<image>" });
    if (/@import/i.test(html)) findings.push({ file: rel, kind: "css-import", value: "@import" });
  }
  const binaryAssets = files.filter((f) => /\.(png|jpe?g|webp|gif|avif|svg|mp4|webm|mov)$/i.test(f)).map((f) => path.relative(buildDir, f));
  for (const f of binaryAssets) findings.push({ file: f, kind: "binary-asset", value: f });
  return { ok: findings.length === 0, scannedFiles: files.length, findings };
}
