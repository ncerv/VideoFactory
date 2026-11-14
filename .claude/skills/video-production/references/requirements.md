# Requisitos externos

| Herramienta | Versión | Obligatoria | Uso | Instalación orientativa |
|---|---|---|---|---|
| Node.js | 22 o superior | Sí | Orquestador y CLI `vf` | https://nodejs.org (o nvm / fnm) |
| npm | La que trae Node | Sí | Dependencias del motor | Incluido con Node.js |
| FFmpeg + ffprobe | 6 o superior | Sí | Procesamiento, mezcla y exportación | Linux: gestor de paquetes · macOS: `brew install ffmpeg` · Windows: `winget install Gyan.FFmpeg` |
| Chrome o Chromium | Reciente | Sí | Lo usa HyperFrames para renderizar | Navegador del sistema o `npx hyperframes browser` |
| HyperFrames | La fijada en el `package.json` del motor | Sí | Composición y render 2D | `npm install` en el repositorio VideoFactory |
| Git | Cualquiera reciente | Recomendada | Control de versiones | https://git-scm.com |
| uv | Reciente | Solo IA | Entornos Python aislados | https://docs.astral.sh/uv/ |
| Python | 3.12 | Solo IA | Servicios de IA | `uv python install 3.12` |
| GPU (CUDA o Apple Silicon) | — | Recomendada para IA | TTS, música y alineación | — |

## Variables de entorno reconocidas

| Variable | Efecto |
|---|---|
| `HYPERFRAMES_BROWSER_PATH` | Ruta del navegador que usará HyperFrames. El detector también acepta `CHROME_PATH` y `PUPPETEER_EXECUTABLE_PATH`. |
| `HYPERFRAMES_FFMPEG_PATH` / `HYPERFRAMES_FFPROBE_PATH` | Rutas de FFmpeg y ffprobe si no están en el PATH |
| `HYPERFRAMES_NO_TELEMETRY=1` | Desactiva la telemetría de HyperFrames. El motor la fija siempre. |

## Detección

`scripts/detect-environment.mjs` busca las herramientas por orden:

1. En las variables de entorno.
2. En el `PATH`.
3. En las ubicaciones estándar de cada sistema: `/Applications` en macOS, `Program Files` en Windows.

Nunca usa rutas propias de una máquina concreta.

El sondeo de red (`--network`) solo abre una conexión TLS a cada host y no envía datos. Si hay un proxy configurado en `HTTPS_PROXY`, lo usa.
