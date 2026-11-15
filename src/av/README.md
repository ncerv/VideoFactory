# av

Integración audiovisual: `vf av render <dir>` une el MP4 de un proyecto visual con la mezcla WAV de un proyecto de audio. Los dos proyectos fuente siguen siendo independientes.

| Módulo | Papel |
|---|---|
| `render.js` | Lee `av.json` (`schemas/av-project.schema.json`) y resuelve los proyectos hermanos. Pide las fuentes a `renderProject` y `renderAudioProject`, cada uno con su caché (son proveedores inyectables, así las pruebas usan fuentes sintéticas). Comprueba el formato real del WAV maestro, multiplexa con `muxAudioVideo` (`src/adapters/ffmpeg.js`), verifica y escribe `output/av-report.json` |
| `verify.js` | Comprueba la especificación del vídeo (la misma `checkSpec` que `vf render`), que los paquetes H.264 son idénticos a la fuente y que el audio es AAC LC a 48 kHz y en estéreo. Verifica el arranque en 0, las duraciones, las muestras declaradas y el relleno, el desfase al principio y al final (deriva), el nivel y los LUFS, la energía por bandas, la presencia de cada stem y la decodificación completa |

## Caché y forzado

La huella de esta etapa se calcula con:

- el **contenido** de las fuentes (SHA-256 del MP4 visual, del WAV maestro y de los stems);
- `av.json` y los ajustes efectivos;
- el grafo de imports de `render.js` (`src/orchestrator/fingerprint.js`);
- la versión de FFmpeg.

La documentación no cuenta. Si una fuente cambia, la integración se rehace aunque `av.json` siga igual.

| Opción | Vídeo | Audio | Multiplexado |
|---|---|---|---|
| (ninguna) | caché de `vf render` | caché de `vf audio render` | solo si cambió la huella |
| `--force` | caché | caché | sí |
| `--force-video` | `vf render --force` | caché | sí |
| `--force-audio` | caché | `vf audio render --force` | sí |
| `--force-all` | `vf render --force` | `vf audio render --force` | sí |

Las comprobaciones de calidad se ejecutan siempre que se multiplexa. La caché solo reutiliza un resultado que fue correcto y cuyas entradas son idénticas.

## Audio: maestro sin pérdida y AAC

- El WAV de `vf audio render` es la **fuente maestra**: esta etapa no lo modifica y comprueba su SHA-256 antes y después.
- Para la entrega se codifica a AAC LC a 192 kb/s, sin filtros, sin `loudnorm` y sin cambios de ganancia.
- Medidas en `audio-engine-test` (10 s):

  | Medida | Resultado |
  |---|---|
  | Nivel RMS | −0,02 dB respecto de la fuente |
  | Sonoridad y pico | −25,7 LUFS y −9,9 dBTP, iguales a la fuente |
  | Bandas por debajo de 8 kHz | ±0,1 dB |
  | Desfase | 0 muestras al principio y al final |
  | Latido (proyección sobre `stems/pulse.wav`) | −0,01 dB respecto de la mezcla original |

  No hay motivo medido para cambiar la tasa de bits.
- **Relleno AAC:**
  - El codificador añade 1024 muestras de retardo y produce ⌈(N + 1024) / 1024⌉ tramas de 1024.
  - El MP4 declara la duración exacta (N) con una lista de edición. Los reproductores respetan la lista y `ffprobe` informa de N.
  - La CLI de FFmpeg, al decodificar, descarta el retardo inicial pero entrega el resto de la última trama: ⌈(N + 1024) / 1024⌉ · 1024 − 1024 − N muestras de silencio (`expectedAacPadding`). Son 256 para 10 s, 384 para 35 s y 640 para 45 s.
  - La verificación exige exactamente ese relleno, con pico < −80 dBFS. No es desfase ni alarga el vídeo.

## Narración

Esta etapa sigue exigiendo un maestro PCM a 48 kHz y en estéreo con la misma duración que el vídeo, y rechaza lo demás sin convertir (`checkMasterFormat`). La voz no entra aquí directamente:

1. El usuario la genera a mano fuera de VideoFactory y la entrega en `projects/<id>/voice/`.
2. `vf voice ingest` (`src/voice`) conserva el original y crea la copia PCM a 48 kHz y estéreo, con soxr y las comprobaciones de duración, clipping, nivel y desfase.
3. `vf mix render` (`src/mix`) la mezcla con música y efectos, con ducking y normalización final.
4. `av.json` con `"audio": { "use": "multitrack" }` multiplexa esa mezcla.
