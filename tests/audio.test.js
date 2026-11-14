// Motor de audio procedural: WAV, DSP con semilla, generadores calibrados, render offline,
// determinismo, mezcla = Σ stems, ducking por voz y ausencia de recursos externos.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import * as lib from "../library/audio/index.js";
import { applyFades, bandEnergy, duckingEnvelope, impulseResponse, noiseChannel, noiseStereo, REFERENCE_BANDS } from "../src/audio/dsp.js";
import { renderAudioProject } from "../src/audio/render.js";
import { loadTone, withDeterminismGuard } from "../src/audio/runtime.js";
import { auditAudioSources } from "../src/audio/verify.js";
import { decodeWav, encodeWav } from "../src/audio/wav.js";
import { paths } from "../src/orchestrator/paths.js";
import { createRng } from "../src/rendering/prng.js";
import { validateAgainst } from "../src/validation/schemas.js";

const PROJECT = path.join(paths.projects, "audio-engine-test");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vf-audio-"));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const sha = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");

test("WAV PCM: ida y vuelta a 16 y 24 bits, dither con semilla y recuento de recortes", () => {
  const ch = [Float32Array.from({ length: 4800 }, (_, i) => 0.5 * Math.sin(i / 10)), new Float32Array(4800)];
  for (const bitDepth of [16, 24]) {
    const { buffer, clipped } = encodeWav(ch, { sampleRate: 48000, bitDepth });
    assert.equal(clipped, 0);
    const d = decodeWav(buffer);
    assert.deepEqual([d.sampleRate, d.bitDepth, d.channels.length, d.frames], [48000, bitDepth, 2, 4800]);
    assert.ok(Math.abs(d.channels[0][100] - ch[0][100]) < 2 / 2 ** (bitDepth - 1));
  }
  assert.ok(encodeWav(ch, { sampleRate: 48000, ditherSeed: 3 }).buffer.equals(encodeWav(ch, { sampleRate: 48000, ditherSeed: 3 }).buffer));
  assert.equal(encodeWav([Float32Array.of(1.5, -2, 0.1)], { sampleRate: 48000, ditherSeed: null }).clipped, 2);
});

test("ruido, respuesta al impulso y fades son deterministas", () => {
  for (const kind of ["white", "pink", "brown"]) {
    assert.deepEqual(noiseChannel(kind, 1000, 7), noiseChannel(kind, 1000, 7));
    assert.notDeepEqual(noiseChannel(kind, 1000, 7), noiseChannel(kind, 1000, 8));
  }
  const [l, r] = noiseStereo("white", 0.1, 48000, 1);
  assert.notDeepEqual(l, r, "canales decorrelados");
  const ir = impulseResponse({ sampleRate: 48000, seed: 4, seconds: 1 });
  assert.deepEqual(ir, impulseResponse({ sampleRate: 48000, seed: 4, seconds: 1 }));
  assert.equal(Math.max(...ir[0].map(Math.abs)), 1);
  const ch = [new Float32Array(48000).fill(1)];
  applyFades(ch, 48000, { fadeIn: 0.5, fadeOut: 0.5 });
  assert.equal(ch[0][0], 0);
  assert.ok(ch[0][47999] < 1e-8);
  assert.equal(ch[0][24000], 1);
});

test("envolvente de ducking: baja amountDb dentro de la ventana y vuelve a 1 fuera", () => {
  const env = duckingEnvelope(48000 * 4, 48000, [{ start: 1, end: 2 }], { amountDb: -12, attack: 0.2, release: 0.4 });
  assert.equal(env[0], 1);
  assert.ok(Math.abs(env[48000 * 1.5] - 10 ** (-12 / 20)) < 1e-6);
  assert.equal(env[48000 * 3], 1);
  assert.ok(env[48000 * 0.9] < 1 && env[48000 * 0.9] > env[48000 * 1.5], "rampa de ataque");
});

test("bandEnergy sitúa un seno de 1 kHz en la banda de la voz", () => {
  const sine = [Float32Array.from({ length: 48000 }, (_, i) => Math.sin((2 * Math.PI * 1000 * i) / 48000))];
  const bands = bandEnergy(sine, 48000, REFERENCE_BANDS);
  assert.ok(bands["300-3000"] > -0.1);
  assert.ok(bands["20-150"] < -40);
});

test("los manifiestos de audio cumplen sus esquemas", () => {
  assert.deepEqual(validateAgainst("audioProject", JSON.parse(fs.readFileSync(path.join(PROJECT, "audio.json"), "utf8"))), []);
  const mixPlan = {
    schemaVersion: 1,
    duration: 10,
    tracks: [
      { id: "musica", role: "music", source: { type: "stem", stem: "output/stems/drone.wav" }, duckedBy: "voz" },
      { id: "voz", role: "voice", source: { type: "tts", segments: [{ id: "s1", start: 1, file: "voz/s1.wav", text: "…" }] } },
    ],
    ducking: { amountDb: -8, attack: 0.25, release: 0.6 },
    loudness: { integratedLufs: -14, truePeakDb: -1 },
  };
  assert.deepEqual(validateAgainst("audioMix", mixPlan), []);
  assert.notDeepEqual(validateAgainst("audioMix", { ...mixPlan, tracks: [{ id: "x", role: "voz", source: {} }] }), []);
});

test("generadores calibrados: el pico aislado está a ±3 dB de gainDb", async () => {
  const Tone = await loadTone();
  const sr = 48000;
  const cases = {
    drone: (c) => lib.drone(c, { gainDb: -20, attack: 0.3, release: 0.3 }),
    wind: (c) => lib.wind(c, { gainDb: -20, attack: 0.3, release: 0.3 }),
    pulse: (c) => lib.pulse(c, { gainDb: -20, intensity: [1, 1] }),
    resonance: (c) => lib.resonance(c, { gainDb: -20, at: 0.2, distance: 0 }),
    whoosh: (c) => lib.whoosh(c, { gainDb: -20, start: 0.2, duration: 2.5 }),
    impact: (c) => lib.impact(c, { gainDb: -20, at: 0.2 }),
  };
  for (const [name, build] of Object.entries(cases)) {
    const buf = await withDeterminismGuard(() =>
      Tone.Offline(() => {
        const out = new Tone.Gain(1).toDestination();
        build({ Tone, lib, out, duration: 3, sampleRate: sr, rng: createRng(1), noise: (k, s, seed = 1) => Tone.ToneAudioBuffer.fromArray(noiseStereo(k, s, sr, seed)) });
      }, 3, 2, sr),
    );
    let peak = 0;
    for (let c = 0; c < 2; c++) for (const s of buf.getChannelData(c)) peak = Math.max(peak, Math.abs(s));
    const db = 20 * Math.log10(peak);
    assert.ok(Math.abs(db + 20) <= 3, `${name}: pico ${db.toFixed(1)} dB`);
  }
});

test("Math.random queda bloqueado durante el render", async () => {
  await assert.rejects(withDeterminismGuard(async () => Math.random()), /Math\.random/);
  assert.equal(typeof Math.random(), "number", "se restaura después");
});

test("la auditoría detecta muestras y cargas externas", () => {
  const dir = path.join(tmp, "audit");
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "loop.wav"), "RIFF");
  fs.writeFileSync(path.join(dir, "audio.js"), 'const p = new Tone.Player("https://example.com/a.mp3");');
  const audit = auditAudioSources({ projectDir: dir, sources: [path.join(dir, "audio.js")] });
  assert.equal(audit.ok, false);
  assert.deepEqual([...new Set(audit.findings.map((f) => f.kind))].sort(), ["audio-file", "sample-player", "url"]);
});

test("audio-engine-test: WAV 48 kHz/16 bits/estéreo verificado, determinista, mezcla = Σ stems y caché", async () => {
  const outA = path.join(tmp, "out-a");
  const outB = path.join(tmp, "out-b");
  const a = await renderAudioProject(PROJECT, { force: true, outputDir: outA });
  assert.equal(a.ok, true, JSON.stringify(a.verification.checks.filter((c) => !c.ok)));
  assert.equal(a.cached, false);
  const p = a.verification.probes["mix.wav"];
  assert.deepEqual([p.codec, p.sampleRate, p.bitDepth, p.channels, p.frames], ["pcm_s16le", 48000, 16, 2, 480000]);
  for (const name of ["mix:clipping", "mix:techo", "mix:fade-in", "mix:fade-out", "recursos-externos"]) {
    assert.ok(a.verification.checks.find((c) => c.name === name)?.ok, name);
  }
  assert.deepEqual(Object.keys(a.files.stems), ["drone", "wind", "pulse", "resonance", "transition"]);
  assert.ok(a.verification.voiceBandDb < -6, "la composición deja espacio para la voz");

  // determinismo: una segunda generación independiente produce archivos idénticos byte a byte
  const b = await renderAudioProject(PROJECT, { force: true, outputDir: outB });
  for (const rel of [a.files.mix, ...Object.values(a.files.stems)]) assert.equal(sha(path.join(outA, rel)), sha(path.join(outB, rel)), rel);
  assert.equal(a.inputsHash, b.inputsHash);

  // la suma de stems reproduce la mezcla (salvo dither/cuantización)
  const mix = decodeWav(fs.readFileSync(path.join(outA, a.files.mix)));
  const stems = Object.values(a.files.stems).map((rel) => decodeWav(fs.readFileSync(path.join(outA, rel))));
  let maxErr = 0;
  for (let i = 0; i < mix.frames; i += 7) {
    const s = stems.reduce((acc, st) => acc + st.channels[0][i], 0);
    maxErr = Math.max(maxErr, Math.abs(s - mix.channels[0][i]));
  }
  assert.ok(maxErr < 12 / 32768, `error máximo ${maxErr}`);

  // sin cambios: no se vuelve a renderizar
  const c = await renderAudioProject(PROJECT, { outputDir: outA });
  assert.equal(c.cached, true);
});

test("la voz entra como subsistema: sus segmentos atenúan música y ambiente sin tocar la composición", async () => {
  const dir = path.join(tmp, "audio-engine-test");
  fs.cpSync(PROJECT, dir, { recursive: true, filter: (src) => !/[\\/]output([\\/]|$)/.test(src) });
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "audio.json"), "utf8"));
  manifest.voice.segments = [{ id: "s1", start: 4, end: 6 }];
  fs.writeFileSync(path.join(dir, "audio.json"), JSON.stringify(manifest));
  const ducked = await renderAudioProject(dir, { force: true });
  const plain = await renderAudioProject(PROJECT, { force: true, outputDir: path.join(tmp, "plain") });
  const level = (root, rel) => {
    const w = decodeWav(fs.readFileSync(path.join(root, rel)));
    let e = 0;
    for (let i = 4.5 * 48000; i < 5.5 * 48000; i++) e += w.channels[0][i] ** 2;
    return 10 * Math.log10(e / 48000);
  };
  const drop = level(path.join(tmp, "plain"), "stems/drone.wav") - level(path.join(dir, "output"), "stems/drone.wav");
  assert.ok(Math.abs(drop - 8) < 0.5, `el drone baja ${drop.toFixed(2)} dB (esperado 8)`);
  const resDrop = level(path.join(tmp, "plain"), "stems/resonance.wav") - level(path.join(dir, "output"), "stems/resonance.wav");
  assert.ok(Math.abs(resDrop) < 0.1, "los efectos (sfx) no se atenúan");
  assert.equal(ducked.voice.segments, 1);
  assert.equal(plain.ok && ducked.ok, true);
});
