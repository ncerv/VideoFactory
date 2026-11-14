// Hoja de contacto: rejilla de fotogramas representativos de un vídeo, generada con FFmpeg.
import { spawn } from "node:child_process";
import { resolveBinary } from "../adapters/ffmpeg.js";

function run(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr }));
  });
}

/** Tiempos repartidos uniformemente, incluyendo el primer y el último fotograma. */
export function evenTimes(duration, fps, count) {
  const last = (Math.round(duration * fps) - 1) / fps;
  return Array.from({ length: count }, (_, i) => Math.round(((last * i) / (count - 1)) * 1000) / 1000);
}

/**
 * @param o { input, output, times (s), fps, columns, thumbWidth, thumbHeight, labels }
 * Con labels=true rotula cada miniatura con su tiempo y número de fotograma (drawtext).
 * Si la instalación de FFmpeg no tiene fuentes disponibles, repite sin rótulos.
 */
export async function contactSheet({ input, output, times, fps, columns = 4, thumbWidth = 360, thumbHeight = 640, labels = true }) {
  const ffmpeg = resolveBinary("ffmpeg");
  const frames = times.map((t) => Math.round(t * fps));
  const rows = Math.ceil(frames.length / columns);
  const select = `select='${frames.map((f) => `eq(n\\,${f})`).join("+")}'`;
  const label = "drawtext=text='%{pts\\:hms}  f%{n}':fontcolor=white@0.92:fontsize=34:box=1:boxcolor=black@0.55:boxborderw=10:x=18:y=h-th-28";
  const scale = `scale=${thumbWidth}:${thumbHeight}:flags=lanczos`;
  const tile = `tile=${columns}x${rows}:padding=10:margin=10:color=0x101418`;

  for (const withLabels of labels ? [true, false] : [false]) {
    // El rótulo se dibuja antes de select para que %{n} sea el número de fotograma original.
    const vf = withLabels ? `${label},${select},${scale},${tile}` : `${select},${scale},${tile}`;
    const { code, stderr } = await run(ffmpeg, ["-v", "error", "-y", "-i", input, "-vf", vf, "-fps_mode", "vfr", "-frames:v", "1", "-q:v", "3", output]);
    if (code === 0) return { output, frames, times, columns, rows, labels: withLabels };
    if (!withLabels) throw new Error(`ffmpeg (hoja de contacto): ${stderr.trim()}`);
  }
  throw new Error("No se pudo generar la hoja de contacto");
}
