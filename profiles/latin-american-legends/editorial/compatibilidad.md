# Nota de compatibilidad operativa

Esta nota **no forma parte** del documento editorial. [`guionista.md`](guionista.md) se conserva intacto (SHA-256 en `../profile.json`). La nota solo explica cómo encaja su metodología con el flujo técnico vigente de VideoFactory: la metodología editorial manda en lo editorial y esta nota, en lo técnico.

## Voz

- El documento dice que la narración la lee una voz de IA (ElevenLabs). **En el flujo vigente**, el usuario genera la narración **a mano en Google AI Studio** con el perfil vocal [`profiles/voices/mystery-documentary.md`](../../voices/mystery-documentary.md). VideoFactory no genera voz ni se conecta a ninguna herramienta de voz.
- El «Texto corrido para la voz» del formato de respuesta del documento es exactamente el texto que se aprueba (`script/script.md`) y se lee en Google AI Studio, sin etiquetas, como pide el Paso 6.

## Velocidad y duración

- El «+12 %» del Paso 4 (105 a 135 palabras, unos 35 a 45 segundos) se mantiene como **referencia editorial** para calcular el número de palabras cuando no hay datos de ritmo. **No es una velocidad garantizada de Google AI Studio** ni un ajuste técnico que VideoFactory aplique.
- La **duración real** de la narración recibida (`vf voice ingest` → `production.duration`) es la referencia definitiva para la producción audiovisual. Las escenas se adaptan a la voz, no al revés.
- **La voz no se acelera, no se ralentiza y no se recorta** para ajustarla a las escenas. Si la duración real queda lejos del objetivo editorial (35 a 45 segundos), se informa al usuario. La corrección es editorial: ajustar el guion, aprobarlo de nuevo y generar otra narración.
- «Mi ritmo de voz» del registro ([`registro.md`](registro.md)) se alimenta con datos reales (palabras del guion y duración real de la narración). El Paso 4 indica cuándo y cómo usarlos.
