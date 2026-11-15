# Arquitectura de VideoFactory

```
               ┌───────────────────────────── Node.js 22+ (orquestador) ─────────────────────────────┐
 project.json  │  storyboard → assets → audio → composición → render → exportación                    │
 storyboard ──▶│                 │          │         │            │            │                       │──▶ MP4
               │                 │          │     HyperFrames ──▶ Chromium     FFmpeg                   │
               └─────────────────┼──────────┼─────────────────────────────────────────────────────────┘
                                 │          │  contrato cli-json (archivos JSON)
                                 ▼          ▼
                     Servicios Python 3.12 aislados (uv): música · alineación (sin instalar)

 Narración: generada a mano fuera (Google AI Studio) → projects/<id>/voice/ → vf voice ingest → vf mix render
```

## Decisiones

1. **Node.js 22+** es el entorno principal de orquestación.
2. **HyperFrames** es el motor visual y de composición 2D: las composiciones son HTML con temporización declarativa y animación GSAP.
3. **FFmpeg** procesa, mezcla y exporta.
4. **Chromium** lo usa HyperFrames para renderizar. VideoFactory no captura fotogramas por su cuenta.
5. **Playwright** solo se usa en pruebas, nunca en producción.
6. **Python** se usa solo en servicios de IA independientes, cada uno con su entorno **uv** y **Python 3.12**.
7. **Solo 2D**: no hay geometría ni modelos 3D.

## Repositorio del motor (no incluido en esta Skill)

| Ruta | Responsabilidad |
|---|---|
| `src/cli/` | CLI `vf` |
| `src/orchestrator/` | Pipeline y diagnóstico |
| `src/adapters/` | HyperFrames, FFmpeg y servicios Python |
| `src/storyboard/`, `src/assets/`, `src/audio/`, `src/rendering/`, `src/validation/` | Etapas del pipeline |
| `schemas/` | Esquemas JSON de proyecto, storyboard, perfil, estilos y servicios |
| `library/` | Estilos, composiciones, movimiento, materiales, transiciones y componentes reutilizables |
| `profiles/` | Perfiles editoriales |
| `services/python/` | Servicios de IA |
| `projects/` | Proyectos de vídeo |
