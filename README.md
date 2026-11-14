# VideoFactory

Motor de producción de vídeo **2D**. Node.js orquesta el trabajo, **HyperFrames** compone y renderiza con Chromium y **FFmpeg** procesa y exporta. Los servicios de IA (voz, música y alineación) son procesos Python independientes.

> **Estado: primera entrega (v0.1.0).** Incluye la base del proyecto, el CLI `vf` (`--version`, `doctor`, `project validate`), los esquemas, el registro de estilos, las interfaces de los servicios de IA y la Skill `video-production`. Los motores de storyboard, assets, audio y composición están pendientes.

## Requisitos

| Herramienta | Versión |
|---|---|
| Node.js | 22 o superior |
| FFmpeg + ffprobe | 6 o superior |
| Chrome o Chromium | Reciente (lo usa HyperFrames) |
| uv + Python 3.12 | Solo para los servicios de IA (todavía no instalados) |

## Inicio rápido

```bash
npm install                                     # instala HyperFrames, GSAP y Ajv (versiones fijadas)
npx vf --version
npx vf doctor                                   # herramientas, versiones y limitaciones
npx vf doctor --network                         # además comprueba el acceso a hosts externos
npx vf project validate projects/example-minimal
npm test                                        # pruebas unitarias
npm run test:render                             # prueba de integración: render real con HyperFrames
```

## Arquitectura

| Componente | Papel |
|---|---|
| Node.js 22+ | Orquestación y CLI `vf` |
| HyperFrames | Motor visual y de composición 2D (composiciones HTML + GSAP) |
| Chromium | Navegador que usa HyperFrames para renderizar |
| FFmpeg | Procesamiento, mezcla y exportación |
| Python 3.12 + uv | Solo en los servicios de IA, cada uno en su propio entorno |
| Playwright | Solo para pruebas, nunca en producción |

La producción es **exclusivamente 2D**: no se usa geometría ni modelos 3D.

## Estructura

```
.claude/skills/video-production/   Skill portable (SKILL.md, references, templates, scripts)
schemas/                           Esquemas JSON: proyecto, storyboard, perfil, estilos, servicios
src/
  cli/                             CLI vf
  orchestrator/                    Pipeline y diagnóstico del entorno
  adapters/                        HyperFrames, FFmpeg y servicios Python
  storyboard/ assets/ audio/       Etapas del pipeline (pendientes)
  rendering/                       Generación de composiciones y render
  validation/                      Validación de proyectos
services/python/                   Servicios de IA: tts (Qwen3-TTS), music (ACE-Step), alignment (WhisperX)
library/                           art-styles, compositions, motion, materials, transitions, components
profiles/latin-american-legends/   Perfil editorial (pendiente de su documento)
projects/                          Proyectos de vídeo (example-minimal incluido)
tests/                             Pruebas (node:test)
```

## Skill `video-production`

La carpeta `.claude/skills/video-production/` no depende del resto del repositorio. Para distribuirla, comprime **la carpeta** de modo que el ZIP contenga `video-production/` en su raíz:

```bash
cd .claude/skills && zip -r video-production.zip video-production
```

En Windows se puede usar «Enviar a → Carpeta comprimida» sobre la carpeta. El ZIP contiene solo la Skill, no el motor VideoFactory.

## Decisiones técnicas de esta entrega

- **Versiones fijadas:** `hyperframes@0.8.229`, `gsap@3.15.0` (la versión que usa HyperFrames) y `ajv@8.20.0`. Además, un `override` fija `undici@7.30.1` para corregir vulnerabilidades de la versión que trae HyperFrames.
- **GSAP local:** las composiciones cargan `vendor/gsap.min.js`. Los CDNs pueden estar bloqueados (`cdn.jsdelivr.net` lo está en el entorno remoto) y hacen el render dependiente de la red.
- **Sin telemetría:** el adaptador ejecuta HyperFrames con `HYPERFRAMES_NO_TELEMETRY=1`. No se usa `hyperframes publish`.
