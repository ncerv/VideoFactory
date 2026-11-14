# adapters

Son la frontera entre el orquestador y las herramientas externas.

| Archivo | Herramienta | Estado |
|---|---|---|
| `hyperframes.js` | CLI de HyperFrames (`lint` y `render`), copia local de GSAP y telemetría desactivada | Básico |
| `ffmpeg.js` | ffprobe (inspección) | Básico |
| `python-service.js` | Servicios de IA (contrato `cli-json`) | Solo interfaz |
