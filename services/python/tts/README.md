# Servicio `tts` — Síntesis de voz (narración)

- **Modelo previsto:** Qwen3-TTS
- **Estado:** `not-installed`. Solo existe el manifiesto [`service.json`](service.json); no hay dependencias, código ni modelos.
- **Python:** 3.12, en un entorno aislado gestionado con uv (`.venv` propio de esta carpeta).
- **Contrato:** [`../CONTRACT.md`](../CONTRACT.md).

## Para activarlo más adelante

1. Crear `pyproject.toml` en esta carpeta (`uv init --package --python 3.12`).
2. Añadir las dependencias del modelo y fijar sus versiones en `uv.lock`.
3. Implementar el punto de entrada que cumpla el contrato y poner su nombre en `entrypoint`.
4. Cambiar `status` a `installed`.

Requiere acceso a `huggingface.co` para descargar pesos (bloqueado en el entorno remoto actual) y, en la práctica, GPU.
