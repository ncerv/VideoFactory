# voice

Recepción de la **narración externa**. VideoFactory no genera voz: el usuario la genera a mano, actualmente en Google AI Studio, con el guion aprobado y un perfil de `profiles/voices/`, y entrega un único archivo WAV o MP3.

| Comando | Etapa | Qué hace |
|---|---|---|
| `vf script approve <dir>` | B | Tras la aprobación explícita del usuario, marca el guion como `approved` y fija el SHA-256 del guion y del perfil vocal en `narration.json` |
| `vf voice ingest <dir> [--pin]` | D | Valida la voz frente al guion aprobado y crea la copia de producción. `--pin` fija el SHA-256 de la narración aceptada |

## Estructura del proyecto

```
projects/<id>/
├── script/script.md      # guion aprobado: el texto exacto de la narración
├── narration.json        # schemas/narration.schema.json
├── voice/narration.wav   # o .mp3: entrada del usuario (no se modifica ni se versiona)
└── output/voice/         # narration-48k.wav (si hace falta) + narration-report.json
```

## Comprobaciones de `vf voice ingest`

1. **Aprobación:** el guion debe estar `approved` y su SHA-256 debe coincidir con el aprobado. El perfil vocal tampoco puede haber cambiado. Si la narración está fijada (`source.sha256`), el archivo debe ser exactamente ese.
2. **Fuente:**
   - Se decodifica entera y se registran formato, códec, frecuencia, canales, profundidad de bits (no aplica en MP3), si es con pérdida, duración y SHA-256.
   - Solo se admite mono o estéreo; no se hace downmix implícito.
3. **Copia de producción:**
   - Si la fuente ya es WAV PCM de 16 o 24 bits a 48 kHz y estéreo, se usa tal cual, sin copia.
   - Si no, FFmpeg la convierte a PCM de 24 bits a 48 kHz y estéreo. Remuestrea con soxr si está disponible (`aresample=48000:resampler=soxr:precision=28`); el mono se duplica en L y R. No se cambia la ganancia.
4. **Verificación de la copia:**
   - número de muestras = round(N · 48000 / fs), con una tolerancia de unas muestras;
   - sin muestras a fondo de escala (si el remuestreo recortaría, falla y la copia se borra);
   - RMS por canal a menos de 0,1 dB de la fuente;
   - canales idénticos si la fuente era mono;
   - desfase 0 frente a la fuente remuestreada por otra vía;
   - original intacto: SHA-256 antes y después.
5. **Caché:** si la fuente, el guion, el perfil, el código y FFmpeg no cambian, no se vuelve a convertir.

En MP3, el decodificador de FFmpeg aplica el retardo y el relleno sin pausas (cabecera LAME), así que la duración medida es la del audio útil.

## Tiempos de frase

Conocer la duración total **no** permite saber cuándo empieza cada frase. Sin alineación (`"alignment": "none"`), la producción se planifica con el storyboard y la duración real. Los tiempos solo se registran en `segments` cuando se han medido, con `"alignment": "manual"`. La alineación automática (WhisperX u otro) no está instalada.
