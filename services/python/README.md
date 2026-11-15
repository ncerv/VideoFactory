# Servicios Python de IA

Python se usa **solo** en estos servicios especializados. Son independientes del orquestador Node.js.

| Carpeta | Tipo | Modelo previsto | Estado |
|---|---|---|---|
| [`alignment/`](alignment/) | Transcripción y alineación | WhisperX | no instalado |

No hay servicio de voz ni de música:
- La narración se genera manualmente fuera de VideoFactory y se recibe con `vf voice ingest` (ver `src/voice/`).
- La música y los efectos se generan solo con Tone.js (`vf audio render`, `src/audio` y `library/audio`).
- Los tipos `tts` y `music` del contrato quedan reservados.

## Reglas

- **Python 3.12** es la versión objetivo (ver `.python-version`).
- Cada servicio tiene su propio entorno aislado gestionado con **uv** (`pyproject.toml` + `uv.lock` + `.venv` dentro de su carpeta). No hay un entorno compartido.
- La comunicación con Node.js sigue [`CONTRACT.md`](CONTRACT.md).
- Los modelos y pesos **nunca** se versionan en git. Se descargarán a una caché externa al repositorio.
- No se usan servicios de pago.

## Limitaciones actuales

En el entorno remoto de desarrollo no hay GPU y `huggingface.co` está bloqueado. Por eso los servicios solo tienen sus interfaces definidas. Se instalarán en una máquina con GPU y acceso a los modelos.
