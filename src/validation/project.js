// Validación de proyectos VideoFactory (`vf project validate`).
// Comprueba el esquema de project.json y la coherencia con el resto del repositorio:
// perfil, estilo artístico, storyboard, composición de entrada y restricción 2D.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { paths } from "../orchestrator/paths.js";
import { validateAgainst } from "./schemas.js";

function readJsonFile(file, issues, label) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    issues.push({ level: "error", code: "invalid-json", message: `${label}: no se puede leer como JSON (${e.message})` });
    return null;
  }
}

/** Ruta relativa que no escapa de la carpeta base. */
function insideDir(base, rel) {
  const resolved = path.resolve(base, rel);
  const relative = path.relative(base, resolved);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? resolved : null;
}

export function loadArtStyles(registryPath = paths.artStyleRegistry) {
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  return new Map(registry.styles.map((s) => [s.id, s]));
}

/**
 * Valida la carpeta de un proyecto.
 * @returns {{ok: boolean, projectDir: string, project: object|null, issues: Array<{level, code, message}>}}
 */
export function validateProject(projectDir, { repoPaths = paths } = {}) {
  const dir = path.resolve(projectDir);
  const issues = [];
  const result = () => ({ ok: !issues.some((i) => i.level === "error"), projectDir: dir, project, issues });
  let project = null;

  const manifestPath = path.join(dir, "project.json");
  if (!fs.existsSync(manifestPath)) {
    issues.push({ level: "error", code: "missing-manifest", message: `No existe project.json en ${dir}` });
    return result();
  }
  project = readJsonFile(manifestPath, issues, "project.json");
  if (!project) return result();

  for (const e of validateAgainst("project", project)) {
    if (e.instancePath === "/rendering/dimension") {
      issues.push({
        level: "error",
        code: "not-2d",
        message: `rendering.dimension es "${project.rendering.dimension}": VideoFactory solo admite producción 2D ("2d")`,
      });
      continue;
    }
    issues.push({ level: "error", code: "schema", message: `project.json${e.instancePath || ""}: ${e.message}` });
  }
  if (issues.length) return result();

  // Identificador = nombre de la carpeta.
  if (project.id !== path.basename(dir)) {
    issues.push({ level: "warning", code: "id-mismatch", message: `El id "${project.id}" no coincide con la carpeta "${path.basename(dir)}"` });
  }

  // H.264 con yuv420p exige dimensiones pares.
  const { width, height } = project.output;
  if (width % 2 || height % 2) {
    issues.push({ level: "error", code: "odd-dimensions", message: `Las dimensiones ${width}x${height} deben ser pares para exportar en H.264` });
  }

  // Estilo artístico registrado y 2D.
  const styles = loadArtStyles(path.join(repoPaths.library, "art-styles", "registry.json"));
  const checkStyle = (id, where) => {
    const style = styles.get(id);
    if (!style) issues.push({ level: "error", code: "unknown-art-style", message: `${where}: estilo "${id}" no está en library/art-styles/registry.json` });
    else if (style.dimension !== "2d") issues.push({ level: "error", code: "non-2d-style", message: `${where}: el estilo "${id}" no es 2D` });
    else if (style.implementation === "pending") issues.push({ level: "warning", code: "style-implementation-pending", message: `${where}: el estilo "${id}" está autorizado, pero su implementación visual está pendiente (sin componentes procedurales probados)` });
    return style;
  };
  checkStyle(project.artStyle, "artStyle");

  // Perfil editorial.
  if (project.profile) {
    const profilePath = path.join(repoPaths.profiles, project.profile, "profile.json");
    if (!fs.existsSync(profilePath)) {
      issues.push({ level: "error", code: "unknown-profile", message: `Perfil "${project.profile}" no encontrado en profiles/` });
    } else {
      const profile = readJsonFile(profilePath, issues, `profiles/${project.profile}/profile.json`);
      if (profile) {
        for (const e of validateAgainst("profile", profile)) {
          issues.push({ level: "error", code: "schema", message: `profile.json${e.instancePath || ""}: ${e.message}` });
        }
        const doc = profile.editorial?.document;
        if (doc) {
          const docPath = insideDir(path.join(repoPaths.profiles, project.profile), doc);
          if (!docPath || !fs.existsSync(docPath)) issues.push({ level: "error", code: "missing-editorial-document", message: `No existe el documento editorial ${doc} del perfil "${project.profile}"` });
          else if (profile.editorial.sha256 && createHash("sha256").update(fs.readFileSync(docPath)).digest("hex") !== profile.editorial.sha256) {
            issues.push({ level: "error", code: "editorial-document-modified", message: `El documento editorial ${doc} no coincide con el original entregado (SHA-256): no debe modificarse` });
          }
        }
        if (profile.status === "awaiting-editorial-document") {
          issues.push({ level: "warning", code: "profile-pending", message: `El perfil "${project.profile}" aún no tiene incorporado su documento editorial` });
        }
        if (profile.artStyles?.length && !profile.artStyles.includes(project.artStyle)) {
          issues.push({ level: "error", code: "style-not-in-profile", message: `El estilo "${project.artStyle}" no está permitido por el perfil "${project.profile}"` });
        }
      }
    }
  }

  // Escena generada: módulo fuente y configuración temporal.
  const generated = Boolean(project.rendering.source);
  if (generated) {
    for (const [field, rel] of [["source", project.rendering.source], ["timing", project.rendering.timing ?? "timing.json"]]) {
      const p = insideDir(dir, rel);
      if (!p) issues.push({ level: "error", code: "path-outside-project", message: `rendering.${field} "${rel}" sale de la carpeta del proyecto` });
      else if (!fs.existsSync(p)) issues.push({ level: "error", code: `missing-${field}`, message: `No existe rendering.${field}: ${rel}` });
    }
    const timingPath = insideDir(dir, project.rendering.timing ?? "timing.json");
    if (timingPath && fs.existsSync(timingPath)) {
      const timing = readJsonFile(timingPath, issues, project.rendering.timing ?? "timing.json");
      if (timing) {
        if (!(timing.duration > 0)) issues.push({ level: "error", code: "timing-duration", message: "timing.json debe definir duration > 0" });
        if (timing.fps !== undefined && timing.fps !== project.output.fps) {
          issues.push({ level: "error", code: "timing-fps", message: `timing.fps (${timing.fps}) no coincide con output.fps (${project.output.fps})` });
        }
      }
    }
  }

  // Composición de entrada de HyperFrames.
  const entry = project.rendering.entry ?? (generated ? `${project.rendering.buildDir ?? "build"}/index.html` : "compositions/index.html");
  const entryPath = insideDir(dir, entry);
  if (!entryPath) {
    issues.push({ level: "error", code: "path-outside-project", message: `rendering.entry "${entry}" sale de la carpeta del proyecto` });
  } else if (!fs.existsSync(entryPath)) {
    issues.push(
      generated
        ? { level: "info", code: "not-built", message: `La composición ${entry} se genera con \`vf build\`` }
        : { level: "warning", code: "missing-entry", message: `No existe la composición de entrada ${entry} (necesaria para renderizar)` },
    );
  }

  // Storyboard.
  if (project.storyboard) {
    const sbPath = insideDir(dir, project.storyboard);
    if (!sbPath) {
      issues.push({ level: "error", code: "path-outside-project", message: `storyboard "${project.storyboard}" sale de la carpeta del proyecto` });
    } else if (!fs.existsSync(sbPath)) {
      issues.push({ level: "error", code: "missing-storyboard", message: `No existe el storyboard ${project.storyboard}` });
    } else {
      const sb = readJsonFile(sbPath, issues, project.storyboard);
      if (sb) {
        const errors = validateAgainst("storyboard", sb);
        for (const e of errors) issues.push({ level: "error", code: "schema", message: `${project.storyboard}${e.instancePath || ""}: ${e.message}` });
        if (!errors.length) {
          const seen = new Set();
          for (const scene of sb.scenes) {
            if (seen.has(scene.id)) issues.push({ level: "error", code: "duplicate-scene", message: `Escena duplicada: "${scene.id}"` });
            seen.add(scene.id);
            if (scene.artStyle) checkStyle(scene.artStyle, `escena ${scene.id}`);
            if (scene.composition) {
              const cp = insideDir(dir, scene.composition);
              if (!cp || !fs.existsSync(cp)) {
                issues.push({ level: "error", code: "missing-composition", message: `Escena ${scene.id}: no existe ${scene.composition}` });
              }
            }
          }
        }
      }
    }
  } else {
    issues.push({ level: "info", code: "no-storyboard", message: "El proyecto no define storyboard todavía" });
  }

  return result();
}

export function formatValidation(res) {
  const lines = [`Proyecto: ${res.projectDir}`];
  const icon = { error: "✗", warning: "!", info: "·" };
  for (const i of res.issues) lines.push(`  ${icon[i.level]} [${i.code}] ${i.message}`);
  const errors = res.issues.filter((i) => i.level === "error").length;
  const warnings = res.issues.filter((i) => i.level === "warning").length;
  lines.push(res.ok ? `Válido (${warnings} advertencias).` : `No válido: ${errors} errores, ${warnings} advertencias.`);
  return lines.join("\n");
}
