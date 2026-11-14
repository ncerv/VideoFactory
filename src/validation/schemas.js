// Carga y compila los esquemas JSON de schemas/ con Ajv (JSON Schema 2020-12).
import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { paths } from "../orchestrator/paths.js";

export const SCHEMA_FILES = {
  project: "project.schema.json",
  storyboard: "storyboard.schema.json",
  profile: "profile.schema.json",
  artStyleRegistry: "art-style-registry.schema.json",
  serviceManifest: "service-manifest.schema.json",
  audioProject: "audio-project.schema.json",
  audioMix: "audio-mix.schema.json",
};

let ajv = null;
const validators = new Map();

function getAjv() {
  if (!ajv) ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
  return ajv;
}

export function getValidator(name) {
  if (!validators.has(name)) {
    const file = SCHEMA_FILES[name];
    if (!file) throw new Error(`Esquema desconocido: ${name}`);
    const schema = JSON.parse(fs.readFileSync(path.join(paths.schemas, file), "utf8"));
    validators.set(name, getAjv().compile(schema));
  }
  return validators.get(name);
}

/** Devuelve la lista de errores de Ajv (vacía si es válido). */
export function validateAgainst(name, data) {
  const validate = getValidator(name);
  return validate(data) ? [] : validate.errors;
}
