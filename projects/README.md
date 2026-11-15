# projects

Cada proyecto vive en `projects/<id>/` y tiene un `project.json` validado por `schemas/project.schema.json`.

```bash
npx vf project validate projects/<id>
```

- Tipos de proyecto: escena visual (`project.json`), audio procedural (`audio.json`), narración y mezcla (`narration.json` + `mix.json`) e integración audiovisual (`av.json`), que solo referencia proyectos hermanos.
- Narración: `script/script.md` (guion aprobado), `narration.json` y `voice/narration.wav` o `.mp3`. Esta última es la voz que entrega el usuario: es una entrada del proyecto y `voice/` no se versiona. Ver `src/voice/README.md`.
- `example-minimal/`: proyecto de ejemplo para probar la validación y el render. No es contenido editorial.
- Las carpetas `output/`, `work/` y `compositions/vendor/` de cada proyecto se generan y no se versionan.
