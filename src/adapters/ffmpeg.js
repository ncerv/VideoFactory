// Adaptador de FFmpeg/ffprobe: procesamiento, mezcla y exportación.
// En esta fase solo ofrece la inspección de archivos (ffprobe). La mezcla y la exportación llegarán con src/audio y src/rendering.
import { spawn } from "node:child_process";
import { findExecutable } from "../../.claude/skills/video-production/scripts/detect-environment.mjs";

export function resolveBinary(name) {
  const envVar = name === "ffmpeg" ? "HYPERFRAMES_FFMPEG_PATH" : "HYPERFRAMES_FFPROBE_PATH";
  return process.env[envVar] || findExecutable(name);
}

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

/** Devuelve los metadatos de un archivo multimedia (formato y streams) mediante ffprobe. */
export async function probe(file) {
  const bin = resolveBinary("ffprobe");
  if (!bin) throw new Error("ffprobe no está disponible");
  const { code, stdout, stderr } = await run(bin, ["-v", "error", "-show_format", "-show_streams", "-of", "json", file]);
  if (code !== 0) throw new Error(`ffprobe falló: ${stderr.trim()}`);
  return JSON.parse(stdout);
}
