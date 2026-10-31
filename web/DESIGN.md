# Sistema de diseño del dashboard

Pantallas de trabajo para una MiPyme que decide **qué concursos preparar antes de que cierren**. El diseño prioriza leer rápido y decidir. No busca impresionar.

## Principios

1. **Un dato por pantalla manda.**
   - Panel: las prioridades por fecha de cierre.
   - Oportunidades: compatibilidad y cierre.
   - Concurso: lo que piden y lo que te falta.
2. **La interfaz no tiene color; los datos sí.**
   - El verde quetzal (`--accent`, #0e6b55) se usa solo en barras de compatibilidad, en el embudo y en el foco.
   - Rojo solo para lo urgente o lo que falta.
3. **El hallazgo va en el título.** Bajo el título de cada pantalla va una frase calculada con los datos, por ejemplo: "47 de 50 oportunidades cierran en los próximos 7 días".
4. **Nada decorativo.** No se usan:
   - degradados, sombras en tarjetas en reposo ni íconos dentro de cuadros de color;
   - emoji ni etiquetas sobre los títulos.
5. **Avisos honestos.**
   - Las fichas de IA indican la confianza y si una persona las validó, con el aviso de confirmar en el documento oficial.
   - Los requisitos posiblemente restrictivos se muestran como señal, no como acusación.

## Tokens (en `src/styles.scss`)

| Grupo | Valores |
| --- | --- |
| Superficies | fondo `#f7f8f6`, tarjeta blanca, borde 1px `#e3e6e2` |
| Texto | `#141714`; secundario `#555c56` (7.1:1); terciario `#687069` (5.1:1) |
| Acción principal | casi negra `#1b1f1c` |
| Radios | tarjeta 8, control 6, pastilla 4 |
| Espaciado | separación 16, relleno de tarjeta 20, márgenes del lienzo 32 (16 en teléfono) |
| Tipografía | **IBM Plex Sans** (400/500/600) con cifras tabulares (`.num`); **IBM Plex Mono** solo para el NOG |
| Escala | título 24, sección 16, KPI 26, cuerpo 14, pequeño 12 |

## Componentes

- **`.panel`**: tarjeta.
- **`.kpis`**: franja de indicadores dentro de una sola tarjeta, con divisiones (no son tarjetas separadas).
- **`.tabla`**: filas de 52 px y montos alineados a la derecha. Toda la fila es enlace y el título es un `<a>` para el teclado.
- **`.barra`**: compatibilidad 0–100. El tono claro (`.preliminar`) indica un puntaje calculado antes de leer las bases.
- **`.pill`**: estado, con tinte pálido y texto oscuro del mismo tono (`positiva`, `negativa`, `aviso`, `dato`).
- **`.btn`**:
  - variantes `btn-primary` y `btn-ghost`;
  - para alternar se usa `aria-pressed`;
  - al presionar se reduce a `scale(0.97)`.
- **`legible`** (pipe): pasa a minúsculas los títulos y entidades que el portal publica en MAYÚSCULAS y respeta siglas como `-IGSS-`.

## Movimiento

- Solo como respuesta a una acción: hover, presión y foco.
- Duración de 120–180 ms con `cubic-bezier(0.23, 1, 0.32, 1)`.
- No hay animaciones de entrada.
- Con `prefers-reduced-motion` se desactiva todo.

## Diseño adaptable

| Ancho | Comportamiento |
| --- | --- |
| ≥ 1100 px | Panel y concurso en dos columnas (contenido y lateral). |
| ≤ 1200 px | Se oculta la columna de modalidad. |
| ≤ 960 px | Se ocultan NOG, monto y faltantes; cierre y compatibilidad siempre visibles. |
| ≤ 860 px | La barra lateral pasa a barra superior con menú. |
| ≤ 600 px | La tabla de oportunidades se apila en tarjetas (título, cierre y compatibilidad). |

## Estados

Cada bloque tiene estado de carga (bloques grises con la forma del contenido), vacío (qué hacer a continuación) y error (qué pasó y cómo seguir).

## Referencias

- Skills del proyecto en `.claude/skills/`: taste-skill (pantallas de aplicación), impeccable, emil-design-eng y web-design-guidelines.
- Referencias visuales en `.claude/design-references/`: Linear, Stripe, IBM y PostHog.
- Revisión visual con Playwright CLI a 1440, 768 y 390 px.
