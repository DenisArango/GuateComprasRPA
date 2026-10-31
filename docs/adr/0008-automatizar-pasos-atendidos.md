# ADR-0008 · Automatizar los pasos que eran atendidos cuando no hace falta una persona

**Estado:** Aceptada · **Fecha:** 2026-10-31 · **Modifica:** [ADR-0006](0006-boletin-y-robot-atendido.md) (modo de ejecución de `VC.Concurso`) y CU-16 (inicio de `VC.Expediente`)

## Contexto

En la primera versión, dos procesos dependían de que una persona los iniciara desde UiPath Assistant:

| Proceso | Por qué era atendido | Qué se observó en la operación real (31/10/2026) |
|---|---|---|
| `VC.Concurso` | El detalle del concurso en Guatecompras está protegido por Cloudflare Turnstile (ADR-0006). | En las tres ejecuciones reales el portal **no pidió verificación**: el navegador normal de la persona, con su perfil de Edge, abrió los detalles sin desafío. |
| `VC.Expediente` | Lo pide la persona cuando decide participar en un concurso. | La decisión ya queda registrada en el dashboard cuando la persona marca **Participaré**. |

Además, el robot desatendido quedó configurado en la misma PC con la cuenta de Windows de la persona, así que puede usar su sesión abierta y su navegador.

## Decisión

1. **`VC.Concurso` corre por disparador** de Orchestrator cada hora de 07:00 a 21:00, con el robot desatendido en la sesión abierta de la PC. El comportamiento ante el captcha **no cambia**: si aparece la verificación, el robot muestra un aviso y espera a la persona (`EsperaVerificacionSegundos`). Si nadie la resuelve, lanza una excepción del sistema, el elemento vuelve a la cola y se reintenta en la siguiente hora. **Nunca se resuelve ni se evade el captcha.** Se puede seguir iniciando desde UiPath Assistant.
2. **`VC.Expediente` se inicia solo** cuando la persona marca **Participaré** en el dashboard: la API pide a Orchestrator el trabajo con `in_Desatendido = True`. En ese modo el robot no muestra ventanas, actualiza la carpeta si ya existe y no la abre. El modo atendido (desde Assistant, con preguntas y resumen) se mantiene.
3. **La validación humana de fichas en Action Center sigue siendo manual** por diseño (RF-IA-07): solo llegan las fichas cuya confianza no se pudo verificar. La tarea se **asigna sola** al revisor (asset `VC_RevisorFichas`) y `RecogerRevisiones` guarda la decisión cada 30 minutos.

## Consecuencias

- ✅ El flujo diario no necesita que nadie inicie robots: boletín → preselección → detalle y documentos → ficha con IA → avisos por correo y Telegram.
- ✅ La persona interviene solo en tres momentos con valor de negocio: resolver el captcha si el portal lo pide, validar una ficha dudosa y decidir si participa.
- ✅ Se cumple el espíritu de ADR-0006: el robot usa el navegador normal y se detiene ante el captcha.
- ⚠ El disparador de `VC.Concurso` necesita la sesión de Windows abierta. Si la PC está bloqueada o apagada, los elementos esperan en la cola.
- ⚠ La licencia Community permite **un** robot desatendido: los trabajos se ejecutan de uno en uno y Orchestrator los encola.
- ⚠ Si el portal empieza a pedir verificación con frecuencia, conviene volver a ejecutar `VC.Concurso` desde Assistant al llegar a la oficina, como en ADR-0006.
