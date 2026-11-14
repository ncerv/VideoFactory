// Dependencias críticas: versiones fijadas, override de seguridad y GSAP local con licencia.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { vendorGsap } from "../src/adapters/hyperframes.js";
import { paths } from "../src/orchestrator/paths.js";

const require = createRequire(import.meta.url);
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const pkg = readJson(path.join(paths.root, "package.json"));
const lock = readJson(path.join(paths.root, "package-lock.json"));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vf-deps-"));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test("dependencias directas fijadas con versión exacta y sincronizadas con el lockfile", () => {
  for (const [name, version] of Object.entries(pkg.dependencies)) {
    assert.match(version, /^\d+\.\d+\.\d+$/, `${name} debe tener versión exacta`);
    assert.equal(lock.packages[""].dependencies[name], version, `${name}: package.json y lockfile difieren`);
    assert.equal(lock.packages[`node_modules/${name}`].version, version, `${name}: versión resuelta distinta`);
  }
});

test("HyperFrames permanece en la base provisional 0.8.229", () => {
  assert.equal(pkg.dependencies.hyperframes, "0.8.229");
  assert.equal(require("hyperframes/package.json").version, "0.8.229");
});

test("undici se fuerza a 7.30.2 solo dentro de HyperFrames", () => {
  assert.deepEqual(pkg.overrides, { hyperframes: { undici: "7.30.2" } });
  const undiciEntries = Object.entries(lock.packages).filter(([k]) => k.endsWith("node_modules/undici"));
  assert.ok(undiciEntries.length >= 1);
  for (const [k, v] of undiciEntries) assert.equal(v.version, "7.30.2", k);
});

test("vendorGsap copia GSAP 3.15.0 íntegro, con su licencia", () => {
  assert.equal(pkg.dependencies.gsap, "3.15.0");
  const dest = vendorGsap(tmp);
  const original = fs.readFileSync(require.resolve("gsap/dist/gsap.min.js"));
  const copy = fs.readFileSync(dest);
  assert.ok(copy.equals(original), "la copia debe ser idéntica al paquete npm");
  const header = copy.subarray(0, 400).toString("utf8");
  assert.match(header, /GSAP 3\.15\.0/);
  assert.match(header, /@license/);
  assert.match(header, /gsap\.com\/standard-license/);
  const notice = fs.readFileSync(path.join(tmp, "vendor", "gsap.LICENSE.txt"), "utf8");
  assert.match(notice, /GSAP 3\.15\.0/);
  assert.match(notice, /standard-license/);
});

test("ninguna composición del repositorio carga scripts desde un CDN", () => {
  const htmls = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory() && e.name !== "node_modules" && e.name !== "vendor") walk(p);
      else if (e.name.endsWith(".html")) htmls.push(p);
    }
  };
  for (const d of [paths.projects, paths.library, paths.skill]) walk(d);
  assert.ok(htmls.length > 0);
  for (const f of htmls) {
    const html = fs.readFileSync(f, "utf8");
    assert.doesNotMatch(html, /<script[^>]+src=["'](https?:)?\/\//i, path.relative(paths.root, f));
    if (/gsap\./.test(html)) assert.match(html, /<script src="vendor\/gsap\.min\.js"><\/script>/, path.relative(paths.root, f));
  }
});

test("undici 7.30.2 ofrece la API que usa HyperFrames (Agent + fetch con lookup propio)", async () => {
  const http = await import("node:http");
  const dns = await import("node:dns");
  // Resolver undici como lo hace HyperFrames: desde su propio paquete.
  const hfRequire = createRequire(require.resolve("hyperframes/package.json"));
  const undiciPath = hfRequire.resolve("undici");
  assert.equal(JSON.parse(fs.readFileSync(path.join(path.dirname(undiciPath), "package.json"), "utf8")).version, "7.30.2");
  const { Agent, fetch } = await import(undiciPath);
  const server = http.createServer((req, res) => res.end("ok"));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  let lookups = 0;
  const lookup = (host, opts, cb) => {
    lookups += 1;
    dns.lookup(host, opts, cb);
  };
  const dispatcher = new Agent({ connect: { lookup } });
  try {
    const res = await fetch(`http://localhost:${server.address().port}/`, { dispatcher });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "ok");
    assert.ok(lookups > 0, "el lookup personalizado debe usarse");
  } finally {
    await dispatcher.close();
    server.close();
  }
});
