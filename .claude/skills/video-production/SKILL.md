---
name: video-production
description: Producción de vídeo 2D con VideoFactory, con HyperFrames para componer, Chromium para renderizar y FFmpeg para procesar y exportar. Úsala para preparar, validar, componer o renderizar proyectos de vídeo, para comprobar si el entorno está listo o para trabajar con estilos artísticos, perfiles editoriales y servicios de IA (voz, música, alineación).
---

# video-production

Skill portable para producir vídeo **2D** con el motor VideoFactory. Funciona igual en el entorno remoto y en una computadora local (Linux, macOS o Windows).

> Esta Skill es un paquete de instrucciones, plantillas y scripts. **No contiene el motor VideoFactory**, que vive en su propio repositorio. Si el motor no está disponible, la Skill sigue sirviendo para diagnosticar el entorno y preparar archivos de proyecto.

## Contenido

| Carpeta | Para qué sirve |
|---|---|
| [references/](references/) | Arquitectura, requisitos, pipeline, notas de HyperFrames y estilos |
| [templates/](templates/) | Plantillas de `project.json`, `storyboard.json` y composición HyperFrames |
| [scripts/](scripts/) | `detect-environment.mjs`: diagnóstico portable del entorno (solo Node.js 22+) |

## Flujo de trabajo

1. **Detectar el entorno.** Ejecuta siempre esto primero:
   - En el repositorio VideoFactory: `npx vf doctor`. Añade `--network` para comprobar los hosts externos.
   - Fuera del repositorio: `node <carpeta-de-esta-skill>/scripts/detect-environment.mjs`. Acepta `--json`, `--network` y `--project-root <dir>`.

   Lee la sección *Limitaciones* y adapta el trabajo a ella: sin GPU, red con proxy, contenedor efímero…
2. **Preparar el proyecto.** Copia las plantillas de [templates/](templates/) a `projects/<id>/`. La composición va en `compositions/index.html`. Ajusta `id`, `title`, `artStyle` y `output`.
3. **Validar** con `npx vf project validate projects/<id>` y corrige todos los errores antes de renderizar.
4. **Componer y renderizar** con HyperFrames siguiendo [references/hyperframes.md](references/hyperframes.md).
   - Escenas generadas por código (`scene.js` + `timing.json`): `npx vf build projects/<id>` y `npx vf render projects/<id>`.
   - `vf render` ejecuta `hyperframes check`, renderiza y verifica el MP4 (resolución, fps, número de fotogramas, duración, continuidad y ausencia de recursos externos). Además genera `output/contact-sheet.jpg`: revísala antes de dar el trabajo por bueno.

## Reglas obligatorias

- **Solo 2D.** No uses geometría, escenas ni modelos 3D (ni WebGL 3D, ni three.js, ni CSS 3D para simular volumen real). Los estilos que evocan materiales físicos se resuelven con ilustración, recortes y texturas 2D.
- **HyperFrames es el motor visual y de composición.** No lo sustituyas por capturas propias con Playwright y FFmpeg. Playwright solo se usa para pruebas.
- **FFmpeg** se usa para procesar, mezclar y exportar.
- **Node.js 22+** orquesta el trabajo. **Python 3.12 con uv** se usa solo en servicios de IA aislados.
- **Todo lo visual se genera con código** (SVG, Canvas procedural, CSS, GSAP): sin imágenes externas, fotografías ni imágenes generadas por IA. La profundidad se simula con capas, escala, opacidad, luz y parallax 2D.
- **Sin CDNs en las composiciones.** GSAP y cualquier otra librería se cargan desde una copia local (`vendor/`).
- **Sin telemetría ni publicación.** Ejecuta HyperFrames con `HYPERFRAMES_NO_TELEMETRY=1` y no uses `hyperframes publish`, que sube el proyecto a un servicio externo.
- **No inventes contenido editorial.** Si un perfil tiene el estado `awaiting-editorial-document`, su documento todavía no existe: no lo reconstruyas.
- **Sin servicios de pago** ni descargas de modelos que no se hayan pedido expresamente.
- **No eludas restricciones de red.** Si un host está bloqueado, informa de ello y propone una alternativa local.

## Requisitos externos

Están detallados en [references/requirements.md](references/requirements.md): Node.js 22+, FFmpeg con ffprobe, Chrome o Chromium y HyperFrames. Para los servicios de IA hacen falta además uv y Python 3.12.
