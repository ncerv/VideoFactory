// Motor visual 2D: generación determinista, contrato de HyperFrames y ausencia de recursos externos.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { paths } from "../src/orchestrator/paths.js";
import { buildProject, RUNTIME_FILES } from "../src/rendering/build.js";
import { evenTimes } from "../src/rendering/contact-sheet.js";
import { createRng } from "../src/rendering/prng.js";
import { orient, polygon, signedArea } from "../src/rendering/svg.js";
import { auditExternalResources, checkSpec } from "../src/rendering/verify.js";
import { validateProject } from "../src/validation/project.js";

const PROJECT = path.join(paths.projects, "night-forest-test");
let tmp;
let built;

before(async () => {
  // Construye en una carpeta temporal para no tocar el proyecto.
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vf-render-unit-"));
  built = await buildProject(PROJECT, { buildDir: path.join(tmp, "build") });
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const read = (rel) => fs.readFileSync(path.join(built.buildDir, rel), "utf8");

test("el PRNG es determinista y sus derivaciones son estables", () => {
  const a = createRng(42);
  const b = createRng(42);
  const seqA = Array.from({ length: 5 }, () => a());
  const seqB = Array.from({ length: 5 }, () => b());
  assert.deepEqual(seqA, seqB);
  assert.ok(seqA.every((v) => v >= 0 && v < 1));
  assert.equal(createRng(7).fork(1)(), createRng(7).fork(1)());
});

test("polygon normaliza la orientación para evitar huecos al combinar figuras", () => {
  const cw = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const ccw = [...cw].reverse();
  assert.ok(signedArea(orient(ccw)) > 0);
  assert.equal(polygon(ccw), polygon(cw));
});

test("el proyecto night-forest-test es válido y está configurado en vertical 1080×1920 a 30 fps", () => {
  const res = validateProject(PROJECT);
  assert.equal(res.ok, true, JSON.stringify(res.issues));
  assert.deepEqual(res.project.output, { width: 1080, height: 1920, fps: 30, format: "mp4" });
  assert.equal(res.project.rendering.dimension, "2d");
  const timing = JSON.parse(fs.readFileSync(path.join(PROJECT, "timing.json"), "utf8"));
  assert.equal(timing.duration * timing.fps, 300);
});

test("vf build genera la estructura de HyperFrames: raíz, escena en <template> y runtimes locales", () => {
  for (const rel of ["index.html", "compositions/night-forest.html", "vendor/gsap.min.js", "vendor/gsap.LICENSE.txt", ...Object.keys(RUNTIME_FILES).map((f) => `vendor/${f}`)]) {
    assert.ok(fs.existsSync(path.join(built.buildDir, rel)), rel);
  }
  const root = read("index.html");
  assert.match(root, /data-composition-id="main"[^>]*data-duration="10"[^>]*data-width="1080"[^>]*data-height="1920"[^>]*data-fps="30"/);
  assert.match(root, /data-composition-src="compositions\/night-forest\.html"/);
  for (const src of ["vendor/gsap.min.js", "vendor/vf-textures.js", "vendor/vf-motion.js"]) assert.ok(root.includes(`<script src="${src}"></script>`), src);
  const scene = read("compositions/night-forest.html");
  assert.match(scene, /^<template>/);
  assert.match(scene, /<\/template>\s*$/);
  assert.match(scene, /<div id="root" data-composition-id="night-forest"/);
  assert.match(scene, /window\.__timelines\["night-forest"\] = tl;/);
});

test("la escena separa capas de profundidad, texturas procedurales y movimiento declarativo", () => {
  const { layers, motion } = built.scene;
  const depths = layers.filter((l) => typeof l.depth === "number").map((l) => l.depth);
  assert.ok(depths.length >= 12, "debe haber varios planos de profundidad");
  assert.ok(Math.min(...depths) < 0.1 && Math.max(...depths) === 1);
  const scene = read("compositions/night-forest.html");
  for (const kind of ["sky", "fog", "grain"]) assert.match(scene, new RegExp(`data-vf-texture="${kind}"`));
  assert.match(scene, /feTurbulence/);
  const types = new Set(motion.map((m) => m.type));
  for (const t of ["camera", "drift", "oscillate", "wander", "sway", "sequence", "jitter"]) assert.ok(types.has(t), t);
});

test("la generación es determinista: dos construcciones producen el mismo HTML", async () => {
  const first = read("compositions/night-forest.html");
  const again = await buildProject(PROJECT, { buildDir: path.join(tmp, "build-2") });
  assert.equal(fs.readFileSync(path.join(again.buildDir, "compositions/night-forest.html"), "utf8"), first);
});

test("composición y runtimes cumplen el contrato de determinismo (sin reloj ni azar sin semilla)", () => {
  const sources = [read("compositions/night-forest.html"), ...Object.keys(RUNTIME_FILES).map((f) => read(`vendor/${f}`))];
  for (const src of sources) {
    assert.doesNotMatch(src, /Math\.random\s*\(/);
    assert.doesNotMatch(src, /Date\.now\s*\(|performance\.now\s*\(|setTimeout\s*\(|setInterval\s*\(|requestAnimationFrame\s*\(/);
    assert.doesNotMatch(src, /repeat\s*:\s*-1/);
  }
});

test("sin imágenes ni recursos externos, y sin 3D", () => {
  const audit = auditExternalResources(built.buildDir);
  assert.equal(audit.ok, true, JSON.stringify(audit.findings));
  const all = read("index.html") + read("compositions/night-forest.html");
  assert.doesNotMatch(all, /three(\.min)?\.js|WebGLRenderer|preserve-3d|perspective\(|rotate[XY]\(|translateZ|getContext\(["']webgl/i);
});

test("auditExternalResources detecta URLs externas e imágenes", () => {
  const dir = fs.mkdtempSync(path.join(tmp, "audit-"));
  fs.writeFileSync(path.join(dir, "index.html"), '<script src="https://cdn.example.com/x.js"></script><img src="a.png"><div style="background:url(foto.jpg)"></div>');
  const audit = auditExternalResources(dir);
  assert.equal(audit.ok, false);
  assert.deepEqual(audit.findings.map((f) => f.kind).sort(), ["css-url", "external-url", "img-tag"]);
});

test("checkSpec y evenTimes", () => {
  const ok = checkSpec({ width: 1080, height: 1920, fps: 30, avgFps: 30, frames: 300, duration: 10, codec: "h264", pixFmt: "yuv420p" }, { width: 1080, height: 1920, fps: 30, frames: 300, duration: 10 });
  assert.ok(ok.every((c) => c.ok));
  const bad = checkSpec({ width: 1920, height: 1080, fps: 25, avgFps: 25, frames: 250, duration: 10, codec: "h264", pixFmt: "yuv420p" }, { width: 1080, height: 1920, fps: 30, frames: 300, duration: 10 });
  assert.deepEqual(bad.filter((c) => !c.ok).map((c) => c.name), ["width", "height", "fps", "frames"]);
  const times = evenTimes(10, 30, 12);
  assert.equal(times.length, 12);
  assert.equal(times[0], 0);
  assert.equal(Math.round(times.at(-1) * 30), 299);
});
