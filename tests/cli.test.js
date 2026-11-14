import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { REPO_ROOT } from "../src/orchestrator/paths.js";

const VF = path.join(REPO_ROOT, "src", "cli", "vf.js");
const vf = (...args) => spawnSync(process.execPath, [VF, ...args], { encoding: "utf8", cwd: REPO_ROOT, timeout: 60000 });

test("vf --version imprime la versión de package.json", () => {
  const { version } = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
  const r = vf("--version");
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), `vf ${version}`);
});

test("vf --help muestra los comandos", () => {
  const r = vf("--help");
  assert.equal(r.status, 0);
  for (const cmd of ["doctor", "project validate"]) assert.match(r.stdout, new RegExp(cmd));
});

test("vf con un comando desconocido termina con código 2", () => {
  const r = vf("inexistente");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Comando desconocido/);
});

test("vf doctor --json devuelve un informe estructurado", () => {
  const r = vf("doctor", "--json");
  const report = JSON.parse(r.stdout);
  assert.equal(r.status, report.ready ? 0 : 1);
  const names = report.tools.map((t) => t.name);
  for (const n of ["node", "npm", "git", "ffmpeg", "ffprobe", "chromium", "hyperframes", "uv", "python3.12"]) {
    assert.ok(names.includes(n), `falta ${n} en el informe`);
  }
  assert.equal(typeof report.gpu.available, "boolean");
  assert.ok(Array.isArray(report.limitations));
  assert.equal(report.network, null, "sin --network no se sondea la red");
  assert.deepEqual(report.services.map((s) => s.kind).sort(), ["alignment", "music", "tts"]);
});

test("vf doctor muestra un informe legible", () => {
  const r = vf("doctor");
  assert.match(r.stdout, /Herramientas:/);
  assert.match(r.stdout, /Limitaciones:/);
  assert.match(r.stdout, /Servicios de IA/);
});

test("vf project validate acepta el proyecto de ejemplo", () => {
  const r = vf("project", "validate", "projects/example-minimal");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Válido/);
});

test("vf project validate falla en una carpeta sin project.json", () => {
  const r = vf("project", "validate", "schemas", "--json");
  assert.equal(r.status, 1);
  const res = JSON.parse(r.stdout);
  assert.equal(res.ok, false);
  assert.equal(res.issues[0].code, "missing-manifest");
});

test("vf project validate rechaza un proyecto 3D (código de salida 1)", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vf-cli-3d-"));
  try {
    const dir = path.join(tmp, "proyecto-3d");
    fs.cpSync(path.join(REPO_ROOT, "projects", "example-minimal"), dir, { recursive: true });
    const project = JSON.parse(fs.readFileSync(path.join(dir, "project.json"), "utf8"));
    project.id = "proyecto-3d";
    project.rendering.dimension = "3d";
    fs.writeFileSync(path.join(dir, "project.json"), JSON.stringify(project));
    const r = vf("project", "validate", dir);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /\[not-2d\]/);
    assert.match(r.stdout, /No válido/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
