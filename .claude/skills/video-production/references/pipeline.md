# Pipeline de producción

| # | Etapa | Responsable | Estado |
|---|---|---|---|
| 1 | Validación del proyecto | `vf project validate` | ✅ Disponible |
| 0 | Desarrollo editorial y aprobación del guion (etapas A y B) | Claude con el documento editorial del perfil · `vf script approve` | ✅ Aprobación disponible (el documento editorial está pendiente de incorporar) |
| 2 | Storyboard: escenas, duraciones, narración | `src/storyboard` | Pendiente |
| 3 | Assets 2D: ilustraciones, texturas, tipografías | `src/assets` | Pendiente |
| 4a | Narración: generada a mano fuera de VideoFactory (etapa C) y recibida (etapa D) | Usuario · `vf voice ingest` | ✅ Disponible |
| 4b | Música y efectos procedurales | `vf audio render` (Tone.js) | ✅ Disponible |
| 4c | Mezcla multipista: ganancias, ducking y normalización final | `vf mix render` | ✅ Disponible |
| 4d | Alineación automática voz-texto | — | Pendiente (sin instalar; hoy, tiempos manuales o planificación por storyboard) |
| 5 | Composición: HTML de HyperFrames por escena | `src/rendering` + `library/` | ✅ Primera versión (`vf build`) |
| 6 | Render a MP4 y verificación | HyperFrames (Chromium) + FFmpeg | ✅ `vf render` |
| 7 | Integración audiovisual: vídeo copiado + mezcla en AAC | `vf av render` | ✅ Disponible |

## Estructura de un proyecto

```
projects/<id>/
├── project.json        # manifiesto (obligatorio)
├── storyboard.json     # escenas
├── compositions/
│   ├── index.html      # composición HyperFrames principal
│   └── vendor/         # GSAP local (generado, no versionado)
├── assets/             # recursos 2D del proyecto
├── script/script.md    # guion aprobado: el texto exacto de la narración
├── narration.json      # guion aprobado + perfil vocal + voz entregada (hashes)
├── voice/              # narración entregada por el usuario (entrada; no versionada)
├── mix.json            # plan de mezcla multipista
├── work/               # archivos intermedios (no versionado)
└── output/             # renders finales (no versionado)
```
