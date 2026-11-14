# orchestrator

Coordina el pipeline de producción: storyboard → assets → audio → composición HyperFrames → render → exportación FFmpeg.

Contenido actual:

- `paths.js`: rutas del repositorio, resueltas siempre de forma relativa.
- `environment.js`: diagnóstico de `vf doctor`. Reutiliza `scripts/detect-environment.mjs` de la Skill.

Pendiente: el pipeline de producción, las etapas y la caché de trabajos.
