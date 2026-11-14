// Viento: ruido coloreado con filtro paso banda que se desplaza en ráfagas (recorrido con semilla),
// silbido estrecho opcional y movimiento estéreo lento.
import { db, gate, randomWalk } from "./envelope.js";

/** Compensación medida: con ella, gainDb ≈ pico del viento aislado (convención de library/audio). */
const MAKEUP_DB = 16;

/**
 * @param o { start, end, color, gainDb, center:[min,max], q, gustStep, intensity:[min,max],
 *            whistle:{freq:[min,max], q, gainDb} | null, panRate, attack, release, seed, send, sendDb, out }
 */
export function wind(ctx, o = {}) {
  const { Tone, rng } = ctx;
  const { start = 0, end = ctx.duration, color = "pink", gainDb = -18, center = [350, 1400], q = 0.9, gustStep = 1.1, intensity = [0.35, 1], whistle = { freq: [1500, 2600], q: 14, gainDb: -16 }, panRate = 0.07, attack = 2.5, release = 2.5, seed = 1, send = null, sendDb = -10, out = ctx.out } = o;
  const len = end - start;
  const source = new Tone.ToneBufferSource(ctx.noise(color, len + 0.1, seed));
  const hp = new Tone.Filter(60, "highpass");
  const band = new Tone.Filter({ frequency: center[0], type: "bandpass", Q: q });
  const gust = new Tone.Gain(0);
  const amp = new Tone.Gain(0);
  const pan = new Tone.AutoPanner({ frequency: panRate, depth: 0.6 }).start(start);
  source.chain(hp, band, gust, amp, pan, out);
  if (send) pan.connect(new Tone.Gain(db(sendDb)).connect(send));
  randomWalk(band.frequency, rng, { start, end, step: gustStep, min: center[0], max: center[1] });
  randomWalk(gust.gain, rng, { start, end, step: gustStep * 0.8, min: intensity[0], max: intensity[1], smooth: 0.5 });
  if (whistle) {
    const wb = new Tone.Filter({ frequency: whistle.freq[0], type: "bandpass", Q: whistle.q });
    const wg = new Tone.Gain(db(whistle.gainDb));
    hp.connect(wb);
    wb.chain(wg, gust);
    randomWalk(wb.frequency, rng, { start, end, step: gustStep * 1.7, min: whistle.freq[0], max: whistle.freq[1], smooth: 0.7 });
  }
  gate(amp.gain, { start, end, level: db(gainDb + MAKEUP_DB), attack, release });
  source.start(start).stop(end);
  return pan;
}
