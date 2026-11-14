# Pipeline de producción

| # | Etapa | Responsable | Estado |
|---|---|---|---|
| 1 | Validación del proyecto | `vf project validate` | ✅ Disponible |
| 2 | Storyboard: escenas, duraciones, narración | `src/storyboard` | Pendiente |
| 3 | Assets 2D: ilustraciones, texturas, tipografías | `src/assets` | Pendiente |
| 4 | Audio: voz (TTS), música, alineación y mezcla | `src/audio` + servicios Python + FFmpeg | Pendiente |
| 5 | Composición: HTML de HyperFrames por escena | `src/rendering` + `library/` | Pendiente |
| 6 | Render a MP4 | HyperFrames (Chromium) | ✅ Adaptador básico |
| 7 | Exportación final: mezcla, normalización, formatos | FFmpeg | Pendiente |

## Estructura de un proyecto

```
projects/<id>/
├── project.json        # manifiesto (obligatorio)
├── storyboard.json     # escenas
├── compositions/
│   ├── index.html      # composición HyperFrames principal
│   └── vendor/         # GSAP local (generado, no versionado)
├── assets/             # recursos 2D del proyecto
├── audio/              # pistas generadas o importadas
├── work/               # archivos intermedios (no versionado)
└── output/             # renders finales (no versionado)
```
