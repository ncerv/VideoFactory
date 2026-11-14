#!/usr/bin/env node
// detect-environment.mjs — Detección portable del entorno para la Skill video-production.
//
// Requisitos: Node.js 22+. Solo usa módulos nativos de Node (sin dependencias),
// sin rutas absolutas fijas y sin comandos exclusivos de un sistema operativo.
// Funciona en Linux, macOS y Windows, en local o en un entorno remoto.
//
// Uso:
//   node scripts/detect-environment.mjs [--json] [--network] [--project-root <dir>]
//
// También se puede importar como módulo:
//   import { detectEnvironment } from "./detect-environment.mjs";

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import tls from "node:tls";
import { fileURLToPath } from "node:url";

const IS_WINDOWS = process.platform === "win32";

export const MIN_NODE_MAJOR = 22;
export const TARGET_PYTHON = "3.12";

/** Hosts que se comprueban con --network (solo se abre una conexión TLS, no se envían datos). */
export const NETWORK_PROBE_HOSTS = [
  "registry.npmjs.org",
  "pypi.org",
  "github.com",
  "huggingface.co",
  "cdn.jsdelivr.net",
  "fonts.googleapis.com",
];

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/** Busca un ejecutable en el PATH (respeta PATHEXT en Windows). */
export function findExecutable(name) {
  const dirs = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  const exts = IS_WINDOWS
    ? ["", ...(process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";").map((e) => e.toLowerCase())]
    : [""];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, name + ext);
      if (isExecutableFile(candidate)) return candidate;
    }
  }
  return null;
}

function isExecutableFile(file) {
  try {
    const st = fs.statSync(file);
    if (!st.isFile()) return false;
    if (IS_WINDOWS) return true;
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Ejecuta un comando sin shell (salvo .cmd/.bat en Windows) y devuelve stdout+stderr. */
export function runCommand(file, args = [], { timeoutMs = 15000 } = {}) {
  const needsShell = IS_WINDOWS && /\.(cmd|bat)$/i.test(file);
  const res = spawnSync(needsShell ? `"${file}"` : file, args, {
    encoding: "utf8",
    timeout: timeoutMs,
    shell: needsShell,
    windowsHide: true,
    env: { ...process.env, HYPERFRAMES_NO_TELEMETRY: "1" },
  });
  if (res.error) return { ok: false, output: "", error: res.error.message };
  const output = `${res.stdout || ""}${res.stderr || ""}`.trim();
  return { ok: res.status === 0, status: res.status, output };
}

function firstLine(text) {
  return (text || "").split(/\r?\n/).find((l) => l.trim()) || "";
}

function matchVersion(text, regex = /(\d+\.\d+(?:\.\d+)?)/) {
  const m = (text || "").match(regex);
  return m ? m[1] : null;
}

function tool(name, { found, version = null, path: p = null, required, note = null, source = null }) {
  return { name, found: Boolean(found), version, path: p, required, note, source };
}

// ---------------------------------------------------------------------------
// Detectores
// ---------------------------------------------------------------------------

function detectNode() {
  const version = process.versions.node;
  const major = Number(version.split(".")[0]);
  const ok = major >= MIN_NODE_MAJOR;
  return tool("node", {
    found: true,
    version,
    path: process.execPath,
    required: true,
    note: ok ? null : `Se requiere Node.js ${MIN_NODE_MAJOR}+`,
    source: ok ? "ok" : "version-too-old",
  });
}

function detectSimple(name, { args = ["--version"], required, regex, note } = {}) {
  const p = findExecutable(name);
  if (!p) return tool(name, { found: false, required, note });
  const r = runCommand(p, args);
  return tool(name, {
    found: true,
    version: matchVersion(r.output, regex) || firstLine(r.output) || null,
    path: p,
    required,
    note,
  });
}

function detectFfmpeg(name, required) {
  const envVar = name === "ffmpeg" ? "HYPERFRAMES_FFMPEG_PATH" : "HYPERFRAMES_FFPROBE_PATH";
  const p = (process.env[envVar] && isExecutableFile(process.env[envVar]) && process.env[envVar]) || findExecutable(name);
  if (!p) return tool(name, { found: false, required, note: "Instalar FFmpeg (incluye ffprobe)" });
  const r = runCommand(p, ["-version"]);
  return tool(name, {
    found: true,
    version: matchVersion(firstLine(r.output), /version\s+(\S+)/),
    path: p,
    required,
  });
}

/** Ubicaciones habituales de Chrome/Chromium por sistema operativo (no específicas de esta sesión). */
function chromiumCandidates() {
  const env = process.env;
  const fromEnv = [
    ["HYPERFRAMES_BROWSER_PATH", env.HYPERFRAMES_BROWSER_PATH],
    ["CHROME_PATH", env.CHROME_PATH],
    ["PUPPETEER_EXECUTABLE_PATH", env.PUPPETEER_EXECUTABLE_PATH],
  ].filter(([, v]) => v);

  const onPath = IS_WINDOWS
    ? ["chrome", "chromium", "msedge"]
    : ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "chrome"];

  const fixed = [];
  if (process.platform === "darwin") {
    fixed.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      path.join(os.homedir(), "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
    );
  } else if (IS_WINDOWS) {
    for (const base of [env.PROGRAMFILES, env["PROGRAMFILES(X86)"], env.LOCALAPPDATA].filter(Boolean)) {
      fixed.push(path.join(base, "Google", "Chrome", "Application", "chrome.exe"));
      fixed.push(path.join(base, "Chromium", "Application", "chrome.exe"));
    }
  }
  return { fromEnv, onPath, fixed };
}

function detectChromium() {
  const { fromEnv, onPath, fixed } = chromiumCandidates();
  let found = null;
  for (const [source, p] of fromEnv) {
    if (isExecutableFile(p)) {
      found = { p, source: `env:${source}` };
      break;
    }
  }
  if (!found) {
    for (const name of onPath) {
      const p = findExecutable(name);
      if (p) {
        found = { p, source: "PATH" };
        break;
      }
    }
  }
  if (!found) {
    for (const p of fixed) {
      if (isExecutableFile(p)) {
        found = { p, source: "system-location" };
        break;
      }
    }
  }
  if (!found) {
    return tool("chromium", {
      found: false,
      required: true,
      note: "Instalar Chrome/Chromium o ejecutar `npx hyperframes browser`; también puede indicarse con HYPERFRAMES_BROWSER_PATH",
    });
  }
  // En Windows chrome.exe --version no imprime nada: la versión queda vacía.
  const version = IS_WINDOWS ? null : matchVersion(runCommand(found.p, ["--version"]).output, /(\d+\.\d+\.\d+\.\d+)/);
  return tool("chromium", { found: true, version, path: found.p, required: true, source: found.source });
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function detectHyperframes(projectRoot) {
  // 1) Instalación local del proyecto (forma preferida y reproducible).
  if (projectRoot) {
    const pkg = readJson(path.join(projectRoot, "node_modules", "hyperframes", "package.json"));
    if (pkg) {
      return tool("hyperframes", {
        found: true,
        version: pkg.version,
        path: path.join(projectRoot, "node_modules", "hyperframes"),
        required: true,
        source: "project",
      });
    }
  }
  // 2) Instalación global.
  const p = findExecutable("hyperframes");
  if (p) {
    const r = runCommand(p, ["--version"]);
    return tool("hyperframes", { found: true, version: matchVersion(r.output), path: p, required: true, source: "global" });
  }
  return tool("hyperframes", {
    found: false,
    required: true,
    note: "Ejecutar `npm install` en el repositorio VideoFactory (o `npm install -g hyperframes`)",
  });
}

function detectPython(uvTool) {
  // Con uv: localizar un intérprete 3.12 ya instalado, sin descargar nada.
  if (uvTool.found) {
    const r = runCommand(uvTool.path, ["python", "find", "--no-python-downloads", TARGET_PYTHON]);
    const p = r.ok ? firstLine(r.output.split(/\r?\n/).filter((l) => !/^warning:/i.test(l)).join("\n")) : "";
    if (p && fs.existsSync(p)) {
      const v = runCommand(p, ["--version"]);
      return tool(`python${TARGET_PYTHON}`, { found: true, version: matchVersion(v.output), path: p, required: false, source: "uv" });
    }
  }
  const candidates = IS_WINDOWS ? [["py", [`-${TARGET_PYTHON}`, "--version"]]] : [[`python${TARGET_PYTHON}`, ["--version"]]];
  for (const [name, args] of candidates) {
    const p = findExecutable(name);
    if (!p) continue;
    const v = runCommand(p, args);
    if (v.ok && (matchVersion(v.output) || "").startsWith(TARGET_PYTHON)) {
      return tool(`python${TARGET_PYTHON}`, { found: true, version: matchVersion(v.output), path: p, required: false, source: "PATH" });
    }
  }
  return tool(`python${TARGET_PYTHON}`, {
    found: false,
    required: false,
    note: `Necesario solo para los servicios de IA. Con uv: \`uv python install ${TARGET_PYTHON}\``,
  });
}

function detectGpu() {
  const nvidia = findExecutable("nvidia-smi");
  if (nvidia) {
    const r = runCommand(nvidia, ["--query-gpu=name,memory.total", "--format=csv,noheader"]);
    if (r.ok && r.output) return { available: true, kind: "nvidia", detail: firstLine(r.output) };
  }
  if (process.platform === "darwin" && process.arch === "arm64") {
    return { available: true, kind: "apple-silicon", detail: "GPU integrada (Metal)" };
  }
  if (process.platform === "linux" && fs.existsSync("/dev/dri")) {
    return { available: true, kind: "dri", detail: "Dispositivo DRI presente (posible VAAPI); sin CUDA" };
  }
  return { available: false, kind: null, detail: "No se detectó GPU utilizable" };
}

function detectRuntime() {
  const env = process.env;
  let kind = "local";
  if (env.CLAUDE_CODE_REMOTE === "true") kind = "claude-code-remote";
  else if (env.CODESPACES === "true") kind = "github-codespaces";
  else if (env.GITHUB_ACTIONS === "true") kind = "github-actions";
  else if (env.CI) kind = "ci";
  const proxyConfigured = Boolean(env.HTTPS_PROXY || env.https_proxy);
  return { kind, remote: kind !== "local", proxyConfigured };
}

function detectOsName() {
  if (process.platform === "linux") {
    try {
      const m = fs.readFileSync("/etc/os-release", "utf8").match(/^PRETTY_NAME="?([^"\n]+)"?/m);
      if (m) return m[1];
    } catch {
      /* distribución sin /etc/os-release */
    }
    return `Linux ${os.release()}`;
  }
  if (process.platform === "darwin") {
    const swVers = findExecutable("sw_vers");
    const v = swVers ? runCommand(swVers, ["-productVersion"]).output : "";
    return `macOS ${v || os.release()}`;
  }
  return typeof os.version === "function" ? os.version() : process.platform;
}

function detectSystem(projectRoot) {
  let diskFreeBytes = null;
  try {
    const st = fs.statfsSync(projectRoot || process.cwd());
    diskFreeBytes = st.bavail * st.bsize;
  } catch {
    /* statfs no disponible: se omite */
  }
  return {
    platform: process.platform,
    arch: process.arch,
    release: os.release(),
    osName: detectOsName(),
    cpus: os.cpus().length,
    memoryTotalBytes: os.totalmem(),
    memoryFreeBytes: os.freemem(),
    diskFreeBytes,
  };
}

// ---------------------------------------------------------------------------
// Sondeo de red (opcional, --network)
// ---------------------------------------------------------------------------

function proxyUrl() {
  const raw = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (!raw) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function noProxyMatches(host) {
  const list = (process.env.NO_PROXY || process.env.no_proxy || "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.some((e) => host === e || (e.startsWith(".") && host.endsWith(e)) || (e.startsWith("*.") && host.endsWith(e.slice(1))));
}

/** Comprueba si se puede abrir una conexión TLS al host (a través del proxy si existe). */
export function probeHost(host, { timeoutMs = 8000 } = {}) {
  return new Promise((resolve) => {
    const done = (reachable, detail) => resolve({ host, reachable, detail });
    const proxy = proxyUrl();
    if (proxy && !noProxyMatches(host)) {
      const headers = { Host: `${host}:443` };
      if (proxy.username) {
        const cred = `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`;
        headers["Proxy-Authorization"] = `Basic ${Buffer.from(cred).toString("base64")}`;
      }
      const req = http.request({
        host: proxy.hostname,
        port: Number(proxy.port) || 80,
        method: "CONNECT",
        path: `${host}:443`,
        headers,
        timeout: timeoutMs,
      });
      req.on("connect", (res, socket) => {
        socket.destroy();
        done(res.statusCode === 200, `proxy CONNECT ${res.statusCode}`);
      });
      req.on("timeout", () => {
        req.destroy();
        done(false, "timeout");
      });
      req.on("error", (e) => done(false, e.code || e.message));
      req.end();
      return;
    }
    const socket = tls.connect({ host, port: 443, servername: host, timeout: timeoutMs }, () => {
      socket.destroy();
      done(true, "tls ok");
    });
    socket.on("timeout", () => {
      socket.destroy();
      done(false, "timeout");
    });
    socket.on("error", (e) => done(false, e.code || e.message));
  });
}

// ---------------------------------------------------------------------------
// Informe
// ---------------------------------------------------------------------------

function deriveLimitations({ tools, gpu, runtime, system, network }) {
  const out = [];
  for (const t of tools) {
    if (t.required && (!t.found || t.source === "version-too-old")) out.push(`Falta herramienta obligatoria: ${t.name}${t.note ? ` — ${t.note}` : ""}`);
  }
  for (const t of tools) {
    if (!t.required && !t.found) out.push(`Herramienta opcional no disponible: ${t.name}${t.note ? ` — ${t.note}` : ""}`);
  }
  if (!gpu.available) out.push("Sin GPU: el render y la inferencia de IA se ejecutarán en CPU (lento).");
  if (runtime.remote) out.push(`Entorno remoto (${runtime.kind}): contenedor efímero; conservar el trabajo con git.`);
  if (runtime.proxyConfigured) out.push("Salida a Internet a través de proxy: algunos hosts pueden estar bloqueados (usar --network para comprobarlo).");
  if (system.memoryTotalBytes < 8 * 1024 ** 3) out.push("Menos de 8 GB de RAM: limitar resolución y paralelismo del render.");
  if (system.diskFreeBytes !== null && system.diskFreeBytes < 10 * 1024 ** 3) out.push("Menos de 10 GB de disco libre: evitar vídeos y modelos grandes.");
  if (network) {
    const blocked = network.filter((n) => !n.reachable).map((n) => n.host);
    if (blocked.length) out.push(`Hosts no accesibles: ${blocked.join(", ")}`);
  }
  return out;
}

/**
 * Detecta herramientas, versiones y limitaciones del entorno.
 * @param {{projectRoot?: string, network?: boolean}} options
 */
export async function detectEnvironment({ projectRoot = null, network = false } = {}) {
  const uv = detectSimple("uv", { required: false, regex: /uv\s+(\S+)/, note: "Gestor de entornos Python (https://docs.astral.sh/uv/)" });
  const tools = [
    detectNode(),
    detectSimple("npm", { required: true }),
    detectSimple("git", { required: false, regex: /version\s+(\S+)/ }),
    detectFfmpeg("ffmpeg", true),
    detectFfmpeg("ffprobe", true),
    detectChromium(),
    detectHyperframes(projectRoot),
    uv,
    detectPython(uv),
    detectSimple("docker", { required: false, regex: /version\s+([^,\s]+)/ }),
  ];
  const gpu = detectGpu();
  const runtime = detectRuntime();
  const system = detectSystem(projectRoot);
  const networkResults = network ? await Promise.all(NETWORK_PROBE_HOSTS.map((h) => probeHost(h))) : null;
  const report = {
    generatedAt: new Date().toISOString(),
    system,
    runtime,
    gpu,
    tools,
    network: networkResults,
  };
  report.limitations = deriveLimitations({ tools, gpu, runtime, system, network: networkResults });
  report.ready = tools.filter((t) => t.required).every((t) => t.found && t.source !== "version-too-old");
  return report;
}

const gb = (n) => (n === null || n === undefined ? "?" : `${(n / 1024 ** 3).toFixed(1)} GB`);

/** Formatea el informe para terminal. */
export function formatReport(report) {
  const lines = [];
  const s = report.system;
  lines.push(`Sistema:  ${s.osName || s.platform} (${s.platform}/${s.arch}) · ${s.cpus} CPU · RAM ${gb(s.memoryTotalBytes)} · disco libre ${gb(s.diskFreeBytes)}`);
  lines.push(`Entorno:  ${report.runtime.kind}${report.runtime.proxyConfigured ? " · proxy de salida" : ""}`);
  lines.push(`GPU:      ${report.gpu.available ? `${report.gpu.kind} — ${report.gpu.detail}` : report.gpu.detail}`);
  lines.push("");
  lines.push("Herramientas:");
  for (const t of report.tools) {
    const mark = t.found && t.source !== "version-too-old" ? "✓" : t.required ? "✗" : "·";
    const kind = t.required ? "obligatoria" : "opcional";
    lines.push(`  ${mark} ${t.name.padEnd(11)} ${(t.version || (t.found ? "?" : "no encontrada")).padEnd(16)} ${kind}${t.path ? `  ${t.path}` : ""}`);
  }
  if (report.network) {
    lines.push("");
    lines.push("Red:");
    for (const n of report.network) lines.push(`  ${n.reachable ? "✓" : "✗"} ${n.host.padEnd(22)} ${n.detail}`);
  }
  lines.push("");
  lines.push("Limitaciones:");
  if (!report.limitations.length) lines.push("  (ninguna detectada)");
  for (const l of report.limitations) lines.push(`  - ${l}`);
  lines.push("");
  lines.push(report.ready ? "Estado: listo para componer y renderizar." : "Estado: faltan herramientas obligatorias.");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Ejecución directa
// ---------------------------------------------------------------------------

const isMain = (() => {
  try {
    return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isMain) {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const network = args.includes("--network");
  const i = args.indexOf("--project-root");
  const projectRoot = i >= 0 ? path.resolve(args[i + 1]) : process.cwd();
  const report = await detectEnvironment({ projectRoot, network });
  console.log(json ? JSON.stringify(report, null, 2) : formatReport(report));
  process.exitCode = report.ready ? 0 : 1;
}
