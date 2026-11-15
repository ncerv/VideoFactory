// Huellas de caché: solo entradas funcionales. La documentación no invalida; configuración, código
// de la composición, generadores y módulos del motor sí. Política de forzado de vf av render.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { engineModules, inputsHash, loadAudioProject } from "../src/audio/render.js";
import { forcePolicy, integrationModules } from "../src/av/render.js";
import { hashFiles, moduleGraph, relativeImports } from "../src/orchestrator/fingerprint.js";
import { paths } from "../src/orchestrator/paths.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vf-cache-"));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const rel = (files) => files.map((f) => path.relative(paths.root, f).split(path.sep).join("/"));

test("relativeImports: estáticos, reexportaciones, efectos y dinámicos; ignora paquetes, node:* y comentarios", () => {
  const src = [
    'import a from "./a.js";',
    'import { b } from "../lib/b.js";',
    'export { c } from "./c.js";',
    'import "./side.js";',
    'const d = await import("./d.js");',
    'import fs from "node:fs";',
    'import * as Tone from "tone";',
    '// import x from "./comentario.js";',
    '/* import y from "./bloque.js"; */',
    'const url = "https://example.invalid/x.js"; import e from "./e.js";',
  ].join("\n");
  assert.deepEqual(relativeImports(src).sort(), ["../lib/b.js", "./a.js", "./c.js", "./d.js", "./e.js", "./side.js"]);
});

test("moduleGraph + hashFiles: un README no cambia la huella; un módulo importado sí", () => {
  const dir = path.join(tmp, "graph");
  fs.mkdirSync(path.join(dir, "lib"), { recursive: true });
  fs.writeFileSync(path.join(dir, "entry.js"), 'import { g } from "./lib/gen.js";\nexport default g;\n');
  fs.writeFileSync(path.join(dir, "lib", "gen.js"), "export const g = 1;\n");
  fs.writeFileSync(path.join(dir, "lib", "unused.js"), "export const u = 1;\n");
  fs.writeFileSync(path.join(dir, "README.md"), "# doc\n");
  const hash = () => hashFiles(createHash("sha256"), moduleGraph([path.join(dir, "entry.js")]), dir).digest("hex");
  assert.deepEqual(moduleGraph([path.join(dir, "entry.js")]).map((f) => path.relative(dir, f)), ["entry.js", path.join("lib", "gen.js")]);
  const h0 = hash();
  fs.writeFileSync(path.join(dir, "README.md"), "# doc cambiada\n");
  fs.writeFileSync(path.join(dir, "lib", "unused.js"), "export const u = 2;\n");
  assert.equal(hash(), h0, "README y módulos no importados no cuentan");
  fs.writeFileSync(path.join(dir, "lib", "gen.js"), "export const g = 2;\n");
  assert.notEqual(hash(), h0, "un generador importado sí cuenta");
  fs.writeFileSync(path.join(dir, "entry.js"), 'import { g } from "./lib/falta.js";\n');
  assert.throws(() => moduleGraph([path.join(dir, "entry.js")]), /inexistente/);
});

test("módulos del motor de audio y de la integración: generadores, DSP, WAV y PRNG; nunca documentación", () => {
  const audio = rel(engineModules());
  for (const f of ["library/audio/index.js", "library/audio/pulse.js", "library/audio/drone.js", "src/audio/dsp.js", "src/audio/wav.js", "src/audio/runtime.js", "src/rendering/prng.js"]) assert.ok(audio.includes(f), `falta ${f}`);
  const av = rel(integrationModules());
  for (const f of ["src/av/render.js", "src/av/verify.js", "src/adapters/ffmpeg.js", "src/audio/render.js"]) assert.ok(av.includes(f), `falta ${f}`);
  for (const f of [...audio, ...av]) assert.match(f, /\.(m?js)$/, `${f} no es código`);
});

test("huella de un proyecto de audio: README no invalida; audio.json, timing.json y la composición sí", async () => {
  const dir = path.join(tmp, "audio-engine-test"); // el id debe coincidir con la carpeta
  fs.cpSync(path.join(paths.projects, "audio-engine-test"), dir, { recursive: true, filter: (f) => !f.includes(`${path.sep}output`) });
  const hash = async () => inputsHash(await loadAudioProject(dir));
  const h0 = await hash();
  assert.equal(await hash(), h0, "estable");
  fs.appendFileSync(path.join(dir, "README.md"), "\nNota.\n");
  assert.equal(await hash(), h0, "un README del proyecto no invalida");

  const edit = (file, fn) => {
    const f = path.join(dir, file);
    const original = fs.readFileSync(f, "utf8");
    fs.writeFileSync(f, fn(original));
    return () => fs.writeFileSync(f, original);
  };
  for (const [file, fn] of [
    ["timing.json", (s) => s.replace('"gainDb": -11', '"gainDb": -12')],
    ["audio.json", (s) => s.replace('"ceilingDb": -1.5', '"ceilingDb": -2')],
    ["audio.js", (s) => s.replace('seed: 3', 'seed: 4')],
  ]) {
    const restore = edit(file, fn);
    assert.notEqual(await hash(), h0, `${file} invalida`);
    restore();
    assert.equal(await hash(), h0, `${file} restaurado vuelve a la misma huella`);
  }
  // Un módulo auxiliar importado por la composición también cuenta.
  fs.writeFileSync(path.join(dir, "helper.js"), "export const k = 1;\n");
  const restore = edit("audio.js", (s) => `import { k } from "./helper.js";\n${s}`);
  const h1 = await hash();
  fs.writeFileSync(path.join(dir, "helper.js"), "export const k = 2;\n");
  assert.notEqual(await hash(), h1, "un módulo auxiliar de la composición invalida");
  restore();
});

test("forcePolicy: --force solo multiplexa; --force-video/--force-audio/--force-all regeneran y multiplexan", () => {
  assert.deepEqual(forcePolicy({}), { video: false, audio: false, mux: false });
  assert.deepEqual(forcePolicy({ force: true }), { video: false, audio: false, mux: true });
  assert.deepEqual(forcePolicy({ forceVideo: true }), { video: true, audio: false, mux: true });
  assert.deepEqual(forcePolicy({ forceAudio: true }), { video: false, audio: true, mux: true });
  assert.deepEqual(forcePolicy({ forceAll: true }), { video: true, audio: true, mux: true });
});

test("CLI: las opciones de regeneración solo valen con vf av render y aparecen en la ayuda", () => {
  const VF = path.join(paths.root, "src", "cli", "vf.js");
  const run = (...args) => spawnSync(process.execPath, [VF, ...args], { encoding: "utf8", cwd: paths.root, timeout: 60000 });
  for (const flag of ["--force-video", "--force-audio", "--force-all"]) {
    const r = run("audio", "render", "projects/audio-engine-test", flag);
    assert.equal(r.status, 2, flag);
    assert.match(r.stderr, /solo es válido con vf av render/);
  }
  const help = run("--help").stdout;
  for (const flag of ["--force-video", "--force-audio", "--force-all"]) assert.match(help, new RegExp(flag));
});
