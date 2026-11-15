// WAV PCM sin compresión (RIFF/WAVE, formato 1). Escritura con dither TPDF con semilla y lectura.
import { mulberry32 } from "../rendering/prng.js";

/**
 * Codifica canales Float32 en [-1, 1] a WAV PCM entero intercalado.
 * @param o { sampleRate, bitDepth (16|24), ditherSeed (null = sin dither) }
 * @returns {{ buffer: Buffer, clipped: number }} clipped = muestras que hubo que recortar al cuantizar
 */
export function encodeWav(channels, { sampleRate, bitDepth = 16, ditherSeed = 1 }) {
  if (![16, 24].includes(bitDepth)) throw new Error(`Profundidad no soportada: ${bitDepth}`);
  const numCh = channels.length;
  const frames = channels[0].length;
  const bytes = bitDepth / 8;
  const dataSize = frames * numCh * bytes;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(numCh, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * numCh * bytes, 28);
  buf.writeUInt16LE(numCh * bytes, 32);
  buf.writeUInt16LE(bitDepth, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataSize, 40);
  const max = 2 ** (bitDepth - 1) - 1;
  const min = -(2 ** (bitDepth - 1));
  const r = ditherSeed === null ? null : mulberry32(ditherSeed);
  let clipped = 0;
  let off = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < numCh; c++) {
      let v = channels[c][i] * max;
      if (r) v += r() - r(); // TPDF de ±1 LSB
      let q = Math.round(v);
      if (q > max) { q = max; clipped++; }
      else if (q < min) { q = min; clipped++; }
      if (bitDepth === 16) buf.writeInt16LE(q, off);
      else buf.writeIntLE(q, off, 3);
      off += bytes;
    }
  }
  return { buffer: buf, clipped };
}

/** Lee un WAV PCM entero (16/24 bits) a canales Float32. */
export function decodeWav(buffer) {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") throw new Error("No es un archivo WAV");
  let pos = 12;
  let fmt = null;
  let data = null;
  while (pos + 8 <= buffer.length) {
    const id = buffer.toString("ascii", pos, pos + 4);
    const size = buffer.readUInt32LE(pos + 4);
    if (id === "fmt ") {
      fmt = { format: buffer.readUInt16LE(pos + 8), channels: buffer.readUInt16LE(pos + 10), sampleRate: buffer.readUInt32LE(pos + 12), bitDepth: buffer.readUInt16LE(pos + 22) };
      // WAVE_FORMAT_EXTENSIBLE (FFmpeg lo usa a partir de 24 bits): el formato real va en el subformato.
      if (fmt.format === 0xfffe && size >= 40) fmt.format = buffer.readUInt16LE(pos + 8 + 24);
    }
    if (id === "data") data = { start: pos + 8, size };
    pos += 8 + size + (size % 2);
  }
  if (!fmt || !data || fmt.format !== 1) throw new Error("WAV PCM no válido");
  const bytes = fmt.bitDepth / 8;
  const frames = data.size / (bytes * fmt.channels);
  const max = 2 ** (fmt.bitDepth - 1);
  const channels = Array.from({ length: fmt.channels }, () => new Float32Array(frames));
  let off = data.start;
  let fullScale = 0;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < fmt.channels; c++) {
      const q = fmt.bitDepth === 16 ? buffer.readInt16LE(off) : buffer.readIntLE(off, 3);
      if (q >= max - 1 || q <= -max) fullScale++;
      channels[c][i] = q / max;
      off += bytes;
    }
  }
  return { ...fmt, frames, channels, fullScaleSamples: fullScale };
}
