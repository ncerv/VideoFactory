# av-integration-test: primera integración audiovisual

Une el render de [`night-forest-test`](../night-forest-test/) (1080×1920, 30 fps, 10 s) con la mezcla aprobada de [`audio-engine-test`](../audio-engine-test/), que tiene el latido a −11 dB. No modifica ninguno de los dos proyectos.

```bash
npx vf av render projects/av-integration-test   # ~5 s con las fuentes en caché; ~0,4 s si nada cambió
```

Si no existen el MP4 visual o la mezcla, se generan primero con `vf render` (unos 70 s) y `vf audio render` (unos 5 s).

Salida (no versionada) en `output/`:

- `av-integration-test.mp4`: H.264 copiado del render visual + AAC LC a 192 kb/s, 48 kHz y estéreo.
- `av-report.json`: fuentes con su SHA-256, propiedades del MP4 y comprobaciones.

El audio entra con su ganancia original (≈ −25,7 LUFS, −9,9 dBTP). Es un ambiente pensado para convivir con la narración, así que todavía no se normaliza. No es contenido editorial.
