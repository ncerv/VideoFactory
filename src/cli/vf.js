#!/usr/bin/env node
// vf — CLI de VideoFactory.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { formatDiagnostics, runDiagnostics } from "../orchestrator/environment.js";
import { REPO_ROOT } from "../orchestrator/paths.js";
import { formatValidation, validateProject } from "../validation/project.js";

const HELP = `vf — VideoFactory

Uso:
  vf --version                        Muestra la versión
  vf doctor [--json] [--network]      Diagnostica herramientas, versiones y limitaciones
  vf project validate [dir] [--json]  Valida un proyecto (por defecto, la carpeta actual)
  vf --help                           Muestra esta ayuda

Opciones:
  --json      Salida en JSON
  --network   (doctor) Comprueba el acceso a hosts externos clave (solo abre conexiones TLS)
`;

export function getVersion() {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")).version;
}

export async function main(argv = process.argv.slice(2), { stdout = process.stdout, stderr = process.stderr } = {}) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        version: { type: "boolean", short: "v" },
        help: { type: "boolean", short: "h" },
        json: { type: "boolean" },
        network: { type: "boolean" },
      },
    });
  } catch (e) {
    stderr.write(`${e.message}\n\n${HELP}`);
    return 2;
  }
  const { values, positionals } = parsed;
  const [command, sub, ...rest] = positionals;

  if (values.version) {
    stdout.write(`vf ${getVersion()}\n`);
    return 0;
  }
  if (values.help || !command) {
    stdout.write(HELP);
    return 0;
  }

  if (command === "doctor") {
    const report = await runDiagnostics({ network: Boolean(values.network) });
    stdout.write(values.json ? `${JSON.stringify(report, null, 2)}\n` : `${formatDiagnostics(report)}\n`);
    return report.ready ? 0 : 1;
  }

  if (command === "project" && sub === "validate") {
    if (rest.length > 1) {
      stderr.write("vf project validate admite una sola carpeta\n");
      return 2;
    }
    const res = validateProject(rest[0] ?? process.cwd());
    stdout.write(values.json ? `${JSON.stringify(res, null, 2)}\n` : `${formatValidation(res)}\n`);
    return res.ok ? 0 : 1;
  }

  stderr.write(`Comando desconocido: ${positionals.join(" ")}\n\n${HELP}`);
  return 2;
}

const invokedDirectly = (() => {
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  process.exitCode = await main();
}
