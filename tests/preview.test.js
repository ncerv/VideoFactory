// Flujo económico: vista previa a escala, caché de construcción y caché de check (sin ejecutar HyperFrames).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { main } from "../src/cli/vf.js";
import { paths } from "../src/orchestrator/paths.js";
import { BUILD_META, buildProject } from "../src/rendering/build.js";
import { scaledSize, sceneFile } from "../src/rendering/composition.js";
import { previewTimes } from "../src/rendering/preview.js";
import { CHECK_CACHE, checkBuild, checkCacheValid } from "../src/rendering/render-project.js";

const PROJECT = path.join(paths.projects, "night-forest-test");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vf-preview-"));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test("scaledSize: dimensiones pares y escala 1 sin cambios", () => {
  assert.deepEqual(scaledSize(1080, 1920, 1), { width: 1080, height: 1920 });
  assert.deepEqual(scaledSize(1080, 1920, 0.5), { width: 540, height: 960 });
  const odd = scaledSize(1080, 1920, 0.33);
  assert.equal(odd.width % 2, 0);
  assert.equal(odd.height % 2, 0);
});

test("sceneFile con escala reduce la salida pero conserva las coordenadas lógicas", () => {
  const scene = { id: "s", width: 1080, height: 1920, duration: 1, css: "", defs: "", layers: [{ id: "l", depth: 0.5, html: "" }], motion: [] };
  const full = sceneFile(scene);
  const half = sceneFile(scene, { scale: 0.5 });
  assert.match(full, /data-width="1080" data-height="1920"/);
  assert.doesNotMatch(full, /transform: scale/);
  assert.match(half, /data-width="540" data-height="960"/);
  assert.match(half, /\.vf-stage \{[^}]*width: 1080px; height: 1920px; transform: scale\(0\.5\)/);
  // el movimiento sigue en coordenadas lógicas
  assert.match(half, /\{"width":1080,"height":1920,"duration":1\}/);
});

test("la construcción se reutiliza si el contenido no cambia, y la vista previa va a otra carpeta", async () => {
  const dir = path.join(tmp, "b");
  const a = await buildProject(PROJECT, { buildDir: dir });
  assert.equal(a.cached, false);
  const meta = JSON.parse(fs.readFileSync(path.join(dir, BUILD_META), "utf8"));
  assert.equal(meta.hash, a.hash);
  const mtime = fs.statSync(path.join(dir, "index.html")).mtimeMs;
  const b = await buildProject(PROJECT, { buildDir: dir });
  assert.equal(b.cached, true);
  assert.equal(b.hash, a.hash);
  assert.equal(fs.statSync(path.join(dir, "index.html")).mtimeMs, mtime, "no debe reescribir");
  const forced = await buildProject(PROJECT, { buildDir: dir, force: true });
  assert.equal(forced.cached, false);
  // falta un archivo: se reconstruye aunque el hash coincida
  fs.rmSync(path.join(dir, "vendor", "vf-motion.js"));
  assert.equal((await buildProject(PROJECT, { buildDir: dir })).cached, false);

  const p = await buildProject(PROJECT, { buildDir: path.join(tmp, "p"), scale: 0.5 });
  assert.notEqual(p.hash, a.hash);
  assert.deepEqual(p.output, { width: 540, height: 960 });
  assert.match(fs.readFileSync(p.entry, "utf8"), /data-width="540" data-height="960" data-fps="30"/);
});

test("la caché de check solo vale para el mismo hash y un resultado correcto", async () => {
  const build = await buildProject(PROJECT, { buildDir: path.join(tmp, "c") });
  const cache = path.join(build.buildDir, CHECK_CACHE);
  fs.writeFileSync(cache, JSON.stringify({ hash: build.hash, ok: true, summary: { lint: { errors: 0, warnings: 0, codes: [] } } }));
  const hit = await checkBuild(build);
  assert.equal(hit.cached, true);
  assert.equal(hit.ok, true);
  // otro hash, un resultado fallido o ninguno nunca se reutilizan
  assert.equal(checkCacheValid({ hash: "otro", ok: true }, build), false);
  assert.equal(checkCacheValid({ hash: build.hash, ok: false }, build), false);
  assert.equal(checkCacheValid(null, build), false);
  assert.equal(checkCacheValid({ hash: build.hash, ok: true }, build), true);
  // y la caché se descarta con la construcción cuando el contenido cambia
  await buildProject(PROJECT, { buildDir: build.buildDir, force: true });
  assert.equal(fs.existsSync(cache), false);
});

test("previewTimes: --at, timing.preview.at o reparto uniforme, sin pasar del último fotograma", () => {
  assert.deepEqual(previewTimes({ at: [5, 1, 1], duration: 10, fps: 30 }), [1, 5]);
  assert.deepEqual(previewTimes({ timing: { preview: { at: [0, 20] } }, duration: 10, fps: 30 }), [0, 9.966]);
  const even = previewTimes({ duration: 10, fps: 30, frames: 8 });
  assert.equal(even.length, 8);
  assert.equal(even[0], 0);
  assert.ok(even.at(-1) <= 299 / 30);
  const timing = JSON.parse(fs.readFileSync(path.join(PROJECT, "timing.json"), "utf8"));
  assert.ok(timing.preview.at.length >= 4, "la escena declara sus instantes clave de revisión");
});

test("vf preview valida sus argumentos antes de hacer trabajo", async () => {
  const sink = { write: () => true };
  let err = "";
  const stderr = { write: (s) => (err += s) };
  assert.equal(await main(["preview", "projects/night-forest-test", "--scale", "2"], { stdout: sink, stderr }), 2);
  assert.equal(await main(["preview", "projects/night-forest-test", "--at", "a,b"], { stdout: sink, stderr }), 2);
  assert.equal(await main(["preview"], { stdout: sink, stderr }), 2);
  assert.match(err, /--scale|--at|Uso: vf preview/);
});
