# cli

`vf.js`: CLI de VideoFactory. Se ejecuta con `npx vf <comando>` o con `npm run vf -- <comando>`.

- `vf --version`
- `vf doctor [--json] [--network]`
- `vf project validate [dir] [--json]`
- `vf av render <dir> [--force | --force-video | --force-audio | --force-all] [--json]`: integración audiovisual (`av.json`). `--force` rehace solo el multiplexado; las otras opciones regeneran también las fuentes indicadas. Son exclusivas de `av render`
