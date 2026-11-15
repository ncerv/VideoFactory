# projects

Cada proyecto vive en `projects/<id>/` y tiene un `project.json` validado por `schemas/project.schema.json`.

```bash
npx vf project validate projects/<id>
```

- Tipos de proyecto: escena visual (`project.json`), audio procedural (`audio.json`) e integración audiovisual (`av.json`), que solo referencia proyectos hermanos.
- `example-minimal/`: proyecto de ejemplo para probar la validación y el render. No es contenido editorial.
- Las carpetas `output/`, `work/` y `compositions/vendor/` de cada proyecto se generan y no se versionan.
