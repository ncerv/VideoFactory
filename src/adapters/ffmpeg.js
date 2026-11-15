// Adaptador de FFmpeg/ffprobe: inspección, procesamiento y exportación.
// La mezcla de audio la hace src/audio; aquí se multiplexa (vídeo + audio → MP4) y se inspecciona.
import { spawn } from "node:child_process";
import { findExecutable } from "../../.claude/skills/video-production/scripts/detect-environment.mjs";

export function resolveBinary(name) {
  const envVar = name === "ffmpeg" ? "HYPERFRAMES_FFMPEG_PATH" : "HYPERFRAMES_FFPROBE_PATH";
  return process.env[envVar] || findExecutable(name);
}

/** Ejecuta un binario y devuelve { code, stdout, stderr }; con binary: true, stdout es un Buffer. */
export function run(bin, args, { binary = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const out = [];
    let stderr = "";
    child.stdout.on("data", (d) => out.push(d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => {
      const buf = Buffer.concat(out);
      resolve({ code, stdout: binary ? buf : buf.toString("utf8"), stderr });
    });
  });
}

function requireBinary(name) {
  const bin = resolveBinary(name);
  if (!bin) throw new Error(`${name} no está disponible`);
  return bin;
}

/** Devuelve los metadatos de un archivo multimedia (formato y streams) mediante ffprobe. */
export async function probe(file, { countFrames = false } = {}) {
  const { code, stdout, stderr } = await run(requireBinary("ffprobe"), ["-v", "error", ...(countFrames ? ["-count_frames"] : []), "-show_format", "-show_streams", "-of", "json", file]);
  if (code !== 0) throw new Error(`ffprobe falló: ${stderr.trim()}`);
  return JSON.parse(stdout);
}

/** Primera línea de `ffmpeg -version` (forma parte de la huella de caché). */
export async function ffmpegVersion() {
  const { stdout } = await run(requireBinary("ffmpeg"), ["-version"]);
  return stdout.split("\n")[0].trim();
}

/**
 * Multiplexa el primer stream de vídeo de `video` (copiado, sin recodificar) con el primer stream
 * de audio de `audio` codificado en AAC. No aplica filtros ni cambios de ganancia.
 * Salida reproducible (bitexact, sin metadatos heredados) y con faststart.
 */
export async function muxAudioVideo({ video, audio, output, bitrate = "192k", sampleRate = 48000, channels = 2 }) {
  const args = [
    "-y", "-v", "error", "-nostdin",
    "-i", video, "-i", audio,
    "-map", "0:v:0", "-map", "1:a:0",
    "-c:v", "copy",
    "-c:a", "aac", "-b:a", bitrate, "-ar", String(sampleRate), "-ac", String(channels),
    "-map_metadata", "-1", "-map_chapters", "-1",
    "-fflags", "+bitexact", "-flags:a", "+bitexact",
    // Escala de tiempo de la película = frecuencia de audio: la lista de edición guarda la duración
    // exacta en muestras (con la escala por defecto, 1000, una duración que no es un número exacto
    // de milisegundos se trunca; 55,333 s perdía 16 muestras). También representa exactamente los
    // fotogramas a 24, 25, 30 o 60 fps.
    "-movie_timescale", String(sampleRate),
    "-movflags", "+faststart",
    "-f", "mp4", output,
  ];
  const { code, stderr } = await run(requireBinary("ffmpeg"), args);
  if (code !== 0) throw new Error(`ffmpeg (multiplexado) falló: ${stderr.trim()}`);
  return { args: args.map((a) => (a === video || a === audio || a === output ? "<archivo>" : a)), warnings: stderr.trim() };
}

/** Huella SHA-256 de los paquetes de un stream copiados tal cual (detecta cualquier recodificación). */
export async function streamPacketHash(file, spec = "v:0") {
  const { code, stdout, stderr } = await run(requireBinary("ffmpeg"), ["-v", "error", "-i", file, "-map", `0:${spec}`, "-c", "copy", "-f", "hash", "-hash", "sha256", "-"]);
  if (code !== 0) throw new Error(`ffmpeg (hash de stream): ${stderr.trim()}`);
  return stdout.trim().replace(/^SHA256=/, "");
}

/** Decodifica el archivo entero; reproducible si termina sin errores. */
export async function decodeCheck(file) {
  const { code, stderr } = await run(requireBinary("ffmpeg"), ["-v", "error", "-xerror", "-i", file, "-map", "0", "-f", "null", "-"]);
  return { ok: code === 0 && stderr.trim() === "", errors: stderr.trim() };
}

/** Decodifica el primer stream de audio a PCM float32 entrelazado y lo devuelve por canales. */
export async function decodeAudioPcm(file, { channels = 2, sampleRate = 48000 } = {}) {
  const { code, stdout, stderr } = await run(requireBinary("ffmpeg"), ["-v", "error", "-i", file, "-map", "0:a:0", "-f", "f32le", "-acodec", "pcm_f32le", "-ac", String(channels), "-ar", String(sampleRate), "-"], { binary: true });
  if (code !== 0) throw new Error(`ffmpeg (decodificación de audio): ${stderr.trim()}`);
  const all = new Float32Array(stdout.buffer.slice(stdout.byteOffset, stdout.byteOffset + stdout.byteLength));
  const frames = all.length / channels;
  return Array.from({ length: channels }, (_, c) => Float32Array.from({ length: frames }, (_, i) => all[i * channels + c]));
}

let soxrCache;
/** ¿Está FFmpeg compilado con libsoxr (remuestreador de alta calidad)? */
export async function hasSoxr() {
  if (soxrCache === undefined) {
    const { stdout, stderr } = await run(requireBinary("ffmpeg"), ["-hide_banner", "-buildconf"]);
    soxrCache = /--enable-libsoxr/.test(stdout + stderr);
  }
  return soxrCache;
}

/**
 * Convierte un audio a WAV PCM de 24 bits a `sampleRate` y estéreo, sin cambiar la ganancia:
 * remuestreo con soxr si está disponible (si no, el de FFmpeg) y, para mono, el mismo canal en
 * izquierda y derecha. Más de dos canales se rechaza: no se hace downmix implícito.
 * @returns { args, resampler, channelMap }
 */
export async function convertToPcmStereo({ input, output, inputSampleRate, inputChannels, sampleRate = 48000 }) {
  if (inputChannels > 2) throw new Error(`${inputChannels} canales: solo se admiten mono o estéreo (no se hace downmix automático)`);
  const filters = [];
  let resampler = null;
  if (inputSampleRate !== sampleRate) {
    resampler = (await hasSoxr()) ? "soxr" : "swr";
    filters.push(resampler === "soxr" ? `aresample=${sampleRate}:resampler=soxr:precision=28` : `aresample=${sampleRate}`);
  }
  const channelMap = inputChannels === 1 ? "mono→estéreo (mismo canal en L y R)" : "estéreo";
  if (inputChannels === 1) filters.push("pan=stereo|c0=c0|c1=c0");
  const args = ["-y", "-v", "error", "-nostdin", "-i", input, "-map", "0:a:0", ...(filters.length ? ["-af", filters.join(",")] : []), "-ac", "2", "-ar", String(sampleRate), "-c:a", "pcm_s24le", "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:a", "+bitexact", "-f", "wav", output];
  const { code, stderr } = await run(requireBinary("ffmpeg"), args);
  if (code !== 0) throw new Error(`ffmpeg (conversión de audio) falló: ${stderr.trim()}`);
  return { args: args.map((a) => (a === input || a === output ? "<archivo>" : a)), resampler, channelMap };
}
