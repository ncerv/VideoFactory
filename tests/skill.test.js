// La Skill video-production debe ser portable: empaquetable como ZIP por sí sola,
// sin rutas absolutas de este entorno ni dependencias del repositorio.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { paths } from "../src/orchestrator/paths.js";
import { detectEnvironment, findExecutable } from "../.claude/skills/video-production/scripts/detect-environment.mjs";

const SKILL = paths.skill;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : [p];
  });
}

test("estructura de la Skill: SKILL.md, references, templates y scripts", () => {
  assert.ok(fs.statSync(path.join(SKILL, "SKILL.md")).isFile());
  for (const d of ["references", "templates", "scripts"]) {
    assert.ok(fs.statSync(path.join(SKILL, d)).isDirectory(), d);
    assert.ok(fs.readdirSync(path.join(SKILL, d)).length > 0, `${d} vacío`);
  }
});

test("SKILL.md tiene frontmatter con name y description", () => {
  const md = fs.readFileSync(path.join(SKILL, "SKILL.md"), "utf8");
  const fm = md.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(fm, "falta frontmatter");
  assert.match(fm[1], /^name: video-production$/m);
  const desc = fm[1].match(/^description: (.+)$/m);
  assert.ok(desc && desc[1].length > 20 && desc[1].length <= 1024, "description ausente o demasiado larga");
});

test("la Skill no contiene rutas absolutas ni referencias fuera de su carpeta", () => {
  const forbidden = [/\/home\/user/, /\/root\//, /\/opt\/(pw-browsers|node)/, /\/tmp\/claude/, /[A-Z]:\\\\Users/, /\.\.\/\.\.\//];
  for (const file of walk(SKILL)) {
    const text = fs.readFileSync(file, "utf8");
    for (const re of forbidden) assert.doesNotMatch(text, re, `${path.relative(SKILL, file)} contiene ${re}`);
  }
});

test("los enlaces relativos de los Markdown de la Skill existen dentro de ella", () => {
  for (const file of walk(SKILL).filter((f) => f.endsWith(".md"))) {
    const text = fs.readFileSync(file, "utf8");
    for (const [, target] of text.matchAll(/\]\((?!https?:|#)([^)#\s]+)/g)) {
      const resolved = path.resolve(path.dirname(file), target);
      assert.ok(resolved.startsWith(SKILL), `${path.relative(SKILL, file)} enlaza fuera de la Skill: ${target}`);
      assert.ok(fs.existsSync(resolved), `${path.relative(SKILL, file)} enlaza a un archivo inexistente: ${target}`);
    }
  }
});

test("los scripts de la Skill solo importan módulos nativos de Node", () => {
  for (const file of walk(path.join(SKILL, "scripts")).filter((f) => /\.(mjs|js)$/.test(f))) {
    const text = fs.readFileSync(file, "utf8");
    for (const [, spec] of text.matchAll(/^\s*import\s[^'"]*["']([^"']+)["']/gm)) {
      assert.ok(spec.startsWith("node:") || spec.startsWith("./"), `${path.basename(file)} importa ${spec}`);
    }
  }
});

test("las plantillas de composición no dependen de CDNs", () => {
  for (const file of walk(path.join(SKILL, "templates")).filter((f) => f.endsWith(".html"))) {
    assert.doesNotMatch(fs.readFileSync(file, "utf8"), /<script[^>]+src=["']https?:/, path.basename(file));
  }
});

test("detect-environment detecta Node y genera limitaciones coherentes", async () => {
  const report = await detectEnvironment({ projectRoot: paths.root });
  const node = report.tools.find((t) => t.name === "node");
  assert.equal(node.version, process.versions.node);
  assert.equal(typeof report.ready, "boolean");
  if (!report.gpu.available) assert.ok(report.limitations.some((l) => l.includes("Sin GPU")));
  assert.equal(findExecutable("esto-no-existe-vf"), null);
});
