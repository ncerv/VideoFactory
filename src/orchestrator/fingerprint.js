// Huellas de caché: solo entradas funcionales.
//
// El código que determina un resultado se obtiene del grafo de imports relativos de sus módulos de
// entrada (estáticos y dinámicos con literal). Así entran exactamente los módulos que se ejecutan y
// nunca la documentación (README, comentarios en otros archivos) ni módulos ajenos. Los paquetes de
// node_modules se representan por su versión, que añade quien llama.
import fs from "node:fs";
import path from "node:path";
import { paths } from "./paths.js";

const IMPORT_RE = [
  /(?:^|[\s;])(?:import|export)\s[^"'`;]*?\bfrom\s*["'](\.{1,2}\/[^"']+)["']/g, // import x from "./a.js" · export { y } from "./b.js"
  /(?:^|[\s;])import\s*["'](\.{1,2}\/[^"']+)["']/g, // import "./side-effect.js"
  /\bimport\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g, // import("./lazy.js")
];

/** Importaciones relativas de un módulo (las de paquetes y node:* se ignoran). */
export function relativeImports(source) {
  // Sin comentarios: un ejemplo de import en un comentario no es una dependencia.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
  const found = new Set();
  for (const re of IMPORT_RE) for (const m of code.matchAll(re)) found.add(m[1]);
  return [...found];
}

/**
 * Cierre transitivo de los imports relativos desde `entries`.
 * @returns rutas absolutas ordenadas (incluye las entradas)
 */
export function moduleGraph(entries) {
  const seen = new Set();
  const queue = entries.map((e) => path.resolve(e));
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    if (!fs.existsSync(file)) throw new Error(`Módulo importado inexistente: ${path.relative(paths.root, file)}`);
    seen.add(file);
    if (!/\.(m?js)$/.test(file)) continue; // JSON importado: cuenta su contenido, no tiene imports
    for (const spec of relativeImports(fs.readFileSync(file, "utf8"))) queue.push(path.resolve(path.dirname(file), spec));
  }
  return [...seen].sort();
}

/** Añade al hasher la ruta relativa (al repositorio, o a `base`) y el contenido de cada archivo. */
export function hashFiles(hasher, files, base = paths.root) {
  for (const f of files) hasher.update(`${path.relative(base, f).split(path.sep).join("/")}\0`).update(fs.readFileSync(f)).update("\0");
  return hasher;
}
