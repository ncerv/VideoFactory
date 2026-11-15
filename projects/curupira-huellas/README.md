# curupira-huellas

Leyenda del Curupira (Brasil, Amazonía), escrita con el modo guion de `profiles/latin-american-legends/editorial/guionista.md`.

**Estado:** etapa E completada (primera producción de prueba). Pendiente de la evaluación del usuario.

- Narración aceptada: 55,32 s, SHA-256 `f1d35525…1eb8`.
- Vídeo final: `../curupira-huellas-av/output/curupira-huellas-av.mp4`: 1080×1920, 30 fps, 1660 fotogramas, 55,333 s, AAC.

| Archivo | Contenido |
|---|---|
| `script/guion.md` | Respuesta completa del modo guion: ficha, lógica, ganchos, ocho escenas y revisión |
| `script/script.md` | Texto corrido para la voz: exactamente lo que se aprobará y se leerá en Google AI Studio |
| `narration.json` | Guion, perfil vocal `mystery-documentary` y archivo de voz esperado (`voice/narration.wav`) |
| `storyboard.json` | Las ocho escenas, con duraciones **provisionales** que se ajustarán a la duración real de la narración |
| `project.json`, `scene.js`, `timing.json` | Escena visual: ocho planos en Sumi Ink, con cortes en el centro de pausas detectadas en la voz (`cuts`) y transiciones declaradas (`transitions`) |
| `audio.json`, `audio.js`, `audio-timing.json` | Música y efectos con Tone.js: drone, río, insectos, pulso, silbido tonal (local), golpes, campana y barrido |
| `mix.json` | Mezcla: narración + 7 stems, ducking de música y ambiente, normalización final |

Orden de trabajo: `vf voice ingest`, `vf audio render`, `vf mix render`, `vf render` y `vf av render ../curupira-huellas-av`.
