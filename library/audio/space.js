// Espacio acústico: reverberación por convolución con una respuesta al impulso sintética y con semilla.
import { impulseResponse } from "../../src/audio/dsp.js";

/**
 * Crea un bus de reverberación. Devuelve el nodo de entrada (envío): conecta ahí las fuentes.
 * @param o { seconds, decay, preDelay, damping, wet (0..1), seed, highcut, out }
 */
export function space(ctx, { seconds = 3.5, decay = 3, preDelay = 0.03, damping = 0.6, wet = 0.5, seed = 1, highcut = 6000, out = ctx.out } = {}) {
  const { Tone } = ctx;
  const ir = impulseResponse({ seconds, decay, preDelay, damping, seed, sampleRate: ctx.sampleRate });
  const input = new Tone.Gain(1);
  const conv = new Tone.Convolver(Tone.ToneAudioBuffer.fromArray(ir));
  const tone = new Tone.Filter(highcut, "lowpass");
  const level = new Tone.Gain(wet);
  input.chain(conv, tone, level, out);
  return input;
}

/** Eco con realimentación (FeedbackDelay de Tone, sin AudioWorklet) hacia `out`. */
export function echo(ctx, { time = 0.45, feedback = 0.35, wet = 0.35, highcut = 3500, out = ctx.out } = {}) {
  const { Tone } = ctx;
  const input = new Tone.Gain(1);
  const delay = new Tone.FeedbackDelay(time, feedback);
  delay.wet.value = 1;
  input.chain(delay, new Tone.Filter(highcut, "lowpass"), new Tone.Gain(wet), out);
  return input;
}
