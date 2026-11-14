import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { paths } from "../src/orchestrator/paths.js";
import { validateProject } from "../src/validation/project.js";
import { validateAgainst } from "../src/validation/schemas.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vf-validation-"));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const base = () => JSON.parse(fs.readFileSync(path.join(paths.projects, "example-minimal", "project.json"), "utf8"));

function makeProject(name, project, files = {}) {
  const dir = path.join(tmp, name);
  fs.mkdirSync(path.join(dir, "compositions"), { recursive: true });
  fs.writeFileSync(path.join(dir, "compositions", "index.html"), "<html></html>");
  fs.writeFileSync(path.join(dir, "project.json"), JSON.stringify({ ...project, id: name }));
  for (const [f, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), JSON.stringify(content));
  return dir;
}
const codes = (res) => res.issues.map((i) => i.code);
const storyboard = { schemaVersion: 1, scenes: [{ id: "a", durationSeconds: 2 }] };

test("un proyecto válido no tiene errores", () => {
  const res = validateProject(makeProject("valido", base(), { "storyboard.json": storyboard }));
  assert.equal(res.ok, true, JSON.stringify(res.issues));
});

test("rechaza un proyecto 3D con un error explícito", () => {
  const p = base();
  p.rendering.dimension = "3d";
  const res = validateProject(makeProject("tres-d", p, { "storyboard.json": storyboard }));
  assert.equal(res.ok, false);
  assert.deepEqual(codes(res), ["not-2d"]);
  assert.match(res.issues[0].message, /solo admite producción 2D/);
});

test("rechaza un estilo no registrado", () => {
  const res = validateProject(makeProject("estilo", { ...base(), artStyle: "no-existe" }, { "storyboard.json": storyboard }));
  assert.ok(codes(res).includes("unknown-art-style"));
});

test("rechaza dimensiones impares", () => {
  const p = base();
  p.output.width = 1281;
  const res = validateProject(makeProject("impar", p, { "storyboard.json": storyboard }));
  assert.ok(codes(res).includes("odd-dimensions"));
});

test("rechaza un perfil inexistente y avisa del perfil pendiente", () => {
  assert.ok(codes(validateProject(makeProject("perfil-x", { ...base(), profile: "no-existe" }, { "storyboard.json": storyboard }))).includes("unknown-profile"));
  const res = validateProject(makeProject("perfil-ok", { ...base(), profile: "latin-american-legends" }, { "storyboard.json": storyboard }));
  assert.equal(res.ok, true);
  assert.ok(codes(res).includes("profile-pending"));
});

test("detecta escenas duplicadas y storyboard ausente", () => {
  const dup = { schemaVersion: 1, scenes: [{ id: "a", durationSeconds: 1 }, { id: "a", durationSeconds: 1 }] };
  assert.ok(codes(validateProject(makeProject("dup", base(), { "storyboard.json": dup }))).includes("duplicate-scene"));
  assert.ok(codes(validateProject(makeProject("sin-sb", base()))).includes("missing-storyboard"));
});

test("impide rutas que salen de la carpeta del proyecto", () => {
  const res = validateProject(makeProject("escape", { ...base(), storyboard: "../../etc/passwd" }));
  assert.ok(codes(res).includes("path-outside-project"));
});

test("los archivos de datos del repositorio cumplen sus esquemas", () => {
  const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
  assert.deepEqual(validateAgainst("artStyleRegistry", read(paths.artStyleRegistry)), []);
  assert.deepEqual(validateAgainst("profile", read(path.join(paths.profiles, "latin-american-legends", "profile.json"))), []);
  for (const kind of ["tts", "music", "alignment"]) {
    assert.deepEqual(validateAgainst("serviceManifest", read(path.join(paths.pythonServices, kind, "service.json"))), [], kind);
  }
  const tpl = path.join(paths.skill, "templates");
  assert.deepEqual(validateAgainst("project", read(path.join(tpl, "project.json"))), []);
  assert.deepEqual(validateAgainst("storyboard", read(path.join(tpl, "storyboard.json"))), []);
});
