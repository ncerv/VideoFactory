# av

Integración audiovisual: `vf av render <dir>` une el MP4 de un proyecto visual con la mezcla WAV de un proyecto de audio. Los dos proyectos fuente siguen siendo independientes.

| Módulo | Papel |
|---|---|
| `render.js` | Lee `av.json` (`schemas/av-project.schema.json`) y resuelve los proyectos hermanos. Llama a `renderProject` y `renderAudioProject`, cada uno con su caché, y comprueba que las duraciones encajan. Después multiplexa con `muxAudioVideo` (`src/adapters/ffmpeg.js`), verifica y escribe `output/av-report.json`. Caché por hash de las fuentes, `av.json`, el código y la versión de FFmpeg |
| `verify.js` | Comprueba: especificación del vídeo (la misma `checkSpec` que `vf render`), paquetes H.264 idénticos a la fuente, AAC LC a 48 kHz en estéreo, arranque en 0, duraciones de los streams, muestras declaradas, desfase por correlación cruzada (`measureLag`), nivel y LUFS frente a la fuente y decodificación completa |

Decisiones:

- **Vídeo:** se copia tal cual (`-c:v copy`).
- **Audio:** AAC a 192 kb/s, sin filtros, sin `loudnorm` y sin cambios de ganancia. La normalización y la voz pertenecen a la etapa de mezcla (`schemas/audio-mix.schema.json`).
- **Salida reproducible:** se usa `bitexact` y no se heredan metadatos, así que dos multiplexados dan el mismo MP4.
- **Duración del AAC:** el MP4 declara la duración exacta mediante una lista de edición (480 000 muestras para 10 s). El decodificador de la CLI de FFmpeg entrega además el relleno de la última trama AAC (< 1024 muestras de silencio). La verificación lo tiene en cuenta.
