// Diagnóstico del entorno para `vf doctor`.
// La detección de herramientas vive en la Skill (scripts/detect-environment.mjs) para que
// exista una sola implementación, portable, compartida por la Skill y el motor.
import { detectEnvironment, formatReport } from "../../.claude/skills/video-production/scripts/detect-environment.mjs";
import { listServices } from "../adapters/python-service.js";
import { REPO_ROOT } from "./paths.js";

export async function runDiagnostics({ network = false } = {}) {
  const report = await detectEnvironment({ projectRoot: REPO_ROOT, network });
  report.services = listServices().map(({ manifest, error, dir }) => ({
    id: manifest?.id ?? dir,
    kind: manifest?.kind ?? null,
    status: manifest?.status ?? "invalid",
    plannedModel: manifest?.plannedModel ?? null,
    error: error ?? null,
  }));
  return report;
}

export function formatDiagnostics(report) {
  const lines = [formatReport(report), "", "Servicios de IA (Python):"];
  for (const s of report.services) {
    lines.push(`  · ${String(s.kind).padEnd(10)} ${String(s.plannedModel).padEnd(11)} ${s.status}${s.error ? ` — ${s.error}` : ""}`);
  }
  return lines.join("\n");
}
