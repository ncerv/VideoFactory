# Perfiles vocales

Instrucciones de interpretación para generar la narración **manualmente** en una herramienta externa (actualmente Google AI Studio). VideoFactory no genera voz ni se conecta a esas herramientas: el usuario copia el perfil, genera el audio y entrega el archivo en `projects/<id>/voice/` (ver `vf voice ingest`).

| Archivo | Uso |
|---|---|
| [`mystery-documentary.md`](mystery-documentary.md) | Narrador documental de misterio, español latinoamericano (preferiblemente acento mexicano) |

- Cada archivo contiene **solo** el texto que se copia en la herramienta. No se añaden comentarios dentro, porque se copiaría también.
- `narration.json → voiceProfile.id` nombra el perfil usado. `vf script approve` fija su SHA-256: si el perfil cambia después, la recepción de la voz se detiene.
- Por defecto, el guion no lleva etiquetas expresivas. La interpretación se dirige con el perfil.
