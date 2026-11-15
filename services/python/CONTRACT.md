# Contrato de los servicios de IA (`cli-json`, versión 1)

El orquestador Node.js y los servicios Python son **procesos independientes**. No comparten código ni memoria: solo se pasan archivos JSON y archivos multimedia.

## Invocación

El orquestador ejecuta, desde la carpeta del servicio:

```
uv run --python 3.12 <entrypoint> --request <ruta/request.json> --response <ruta/response.json>
```

- `<entrypoint>` se define en `service.json`.
- Las rutas son absolutas y las genera el orquestador para cada trabajo dentro de `projects/<id>/work/`.
- El servicio no debe acceder a la red durante la inferencia. Los modelos se descargan en un paso de instalación aparte.
- El código de salida es `0` si la petición se completó y cualquier otro valor si falló. En ambos casos se debe escribir `response.json` si es posible.

## `request.json`

```json
{
  "contractVersion": 1,
  "jobId": "string",
  "kind": "tts | music | alignment",
  "input": { },
  "outputDir": "ruta donde escribir los archivos generados",
  "options": { "device": "cpu | cuda | mps", "seed": 0 }
}
```

## `response.json`

```json
{
  "contractVersion": 1,
  "jobId": "string",
  "ok": true,
  "outputs": [{ "role": "audio", "path": "...", "mimeType": "audio/wav" }],
  "metadata": { "durationSeconds": 0, "model": "string", "device": "cpu" },
  "error": null
}
```

## Entradas previstas por tipo (borrador)

| `kind` | `input` |
|---|---|
| `tts` | Reservado. Sin servicio: la narración es externa y manual (`vf voice ingest`) |
| `music` | `{ "prompt", "durationSeconds" }` → audio WAV |
| `alignment` | `{ "audioPath", "language", "text?" }` → JSON con tiempos por palabra |

Estas entradas se cerrarán cuando se implemente cada servicio. El lado Node.js está en `src/adapters/python-service.js`.
