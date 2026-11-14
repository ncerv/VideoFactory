// Rutas del repositorio VideoFactory, resueltas desde este archivo (nunca absolutas fijas).
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const paths = {
  root: REPO_ROOT,
  schemas: path.join(REPO_ROOT, "schemas"),
  profiles: path.join(REPO_ROOT, "profiles"),
  library: path.join(REPO_ROOT, "library"),
  artStyleRegistry: path.join(REPO_ROOT, "library", "art-styles", "registry.json"),
  projects: path.join(REPO_ROOT, "projects"),
  pythonServices: path.join(REPO_ROOT, "services", "python"),
  skill: path.join(REPO_ROOT, ".claude", "skills", "video-production"),
};
