// Adaptador de servicios Python de IA (contrato cli-json v1, ver services/python/CONTRACT.md).
// En esta fase solo lee los manifiestos y construye la invocación; no ejecuta modelos.
import fs from "node:fs";
import path from "node:path";
import { paths } from "../orchestrator/paths.js";

export const CONTRACT_VERSION = 1;

export class ServiceNotInstalledError extends Error {
  constructor(id) {
    super(`El servicio de IA "${id}" no está instalado todavía (status: not-installed).`);
    this.name = "ServiceNotInstalledError";
    this.serviceId = id;
  }
}

/** Lista los servicios definidos en services/python/<carpeta>/service.json. */
export function listServices(root = paths.pythonServices) {
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => {
      const file = path.join(root, d.name, "service.json");
      if (!fs.existsSync(file)) return null;
      try {
        return { dir: d.name, path: path.dirname(file), manifest: JSON.parse(fs.readFileSync(file, "utf8")) };
      } catch (e) {
        return { dir: d.name, path: path.dirname(file), manifest: null, error: `service.json inválido: ${e.message}` };
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.dir.localeCompare(b.dir));
}

export function getService(kind, root = paths.pythonServices) {
  return listServices(root).find((s) => s.manifest?.kind === kind) ?? null;
}

/**
 * Construye (sin ejecutar) la invocación `uv run` de un servicio.
 * Lanza ServiceNotInstalledError si el servicio aún no está instalado.
 */
export function buildInvocation(service, { requestPath, responsePath }) {
  const m = service.manifest;
  if (!m || m.status !== "installed" || !m.entrypoint) throw new ServiceNotInstalledError(m?.id ?? service.dir);
  return {
    command: "uv",
    args: ["run", "--python", m.python, m.entrypoint, "--request", requestPath, "--response", responsePath],
    cwd: service.path,
  };
}

/** Crea el objeto request.json del contrato. */
export function createRequest({ jobId, kind, input, outputDir, options = {} }) {
  return { contractVersion: CONTRACT_VERSION, jobId, kind, input, outputDir, options };
}
