import assert from "node:assert/strict";
import { test } from "node:test";
import { listServices, buildInvocation, ServiceNotInstalledError, createRequest } from "../src/adapters/python-service.js";
import { loadArtStyles } from "../src/validation/project.js";

test("el registro contiene los estilos acordados, todos 2D", () => {
  const styles = loadArtStyles();
  const expected = [
    "woodblock-print", "pixel-art", "noir-comic", "1930s-cartoon", "brick-toy", "clay-diorama",
    "knitted-puppet", "ps2-style", "sumi-ink", "painted-codex", "paper-cutout", "crt-vector",
  ];
  assert.deepEqual([...styles.keys()].sort(), [...expected].sort());
  for (const s of styles.values()) assert.equal(s.dimension, "2d", s.id);
  const crt = styles.get("crt-vector");
  assert.equal(crt.implementation, "pending", "CRT Vector autorizado, implementación pendiente");
  assert.match(crt.summary, /Misterios urbanos o lost media/, "descripción tomada del Paso 10");
});

test("los servicios de IA están declarados pero no instalados", () => {
  const services = listServices();
  // La voz no es un servicio local: se genera fuera de VideoFactory y se recibe con vf voice ingest.
  assert.deepEqual(services.map((s) => s.manifest.plannedModel).sort(), ["WhisperX"]);
  assert.ok(!services.some((s) => ["tts", "music"].includes(s.manifest.kind)), "ni servicio TTS local ni modelo generativo de música");
  for (const s of services) {
    assert.equal(s.manifest.status, "not-installed");
    assert.equal(s.manifest.python, "3.12");
    assert.throws(() => buildInvocation(s, { requestPath: "r.json", responsePath: "s.json" }), ServiceNotInstalledError);
  }
});

test("buildInvocation genera un comando uv run para un servicio instalado", () => {
  const svc = { dir: "tts", path: "svc", manifest: { id: "x", status: "installed", entrypoint: "main.py", python: "3.12" } };
  const inv = buildInvocation(svc, { requestPath: "r.json", responsePath: "s.json" });
  assert.equal(inv.command, "uv");
  assert.deepEqual(inv.args, ["run", "--python", "3.12", "main.py", "--request", "r.json", "--response", "s.json"]);
  assert.equal(createRequest({ jobId: "j", kind: "tts", input: {}, outputDir: "o" }).contractVersion, 1);
});
