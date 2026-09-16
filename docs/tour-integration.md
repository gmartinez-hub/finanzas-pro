# Guía Mangos: contrato de integración

La guía se inicia únicamente por una acción explícita que cambie `enabled` a `true`. Reemplaza el `TourGuide` embebido y su `SLIDE_MAP`; no montar ambos. No guarda un progreso automático ni abre una conexión en uso personal normal. Cerrar la guía desuscribe el canal y pide al padre poner `enabled=false`.

```jsx
import TourGuide from './tour/TourGuide.jsx';

<TourGuide
  enabled={tourEnabled}
  onClose={() => setTourEnabled(false)}
  navigate={navTo}
  onAction={handleTourAction}
  supabaseConfig={{ url: SUPABASE_URL, anonKey: SUPABASE_KEY }}
/>
```

Las constantes de Supabase permanecen en la configuración existente de App. Este módulo no duplica una key ni consulta otro proyecto. Para demo o QA local, pasar `transport={null}` evita toda conexión aunque haya configuración. No habilitar seguimiento remoto automáticamente a partir de un dato persistido o URL.

| Prop | Contrato |
| --- | --- |
| `enabled` | Booleano; `false` por defecto. No crea cliente, consulta, suscripción ni navega si está deshabilitado. |
| `onClose()` | Padre deshabilita la guía; no cambia estado de la presentación. |
| `navigate(route)` | Acepta rutas existentes `dashboard`, `goals`, `transactions`, `import`, `investments`. `dashboard` debe renderizar el nuevo resumen. |
| `onAction(actionId, context)` | Recibe sólo acciones declaradas en la tabla. `context={stepId,source}`; `source` es `enter` o `button`. Implementar una selección determinista o apertura de panel, nunca `.click()` sobre el DOM. |
| `supabaseConfig` | `{url,anonKey}` tomado de la configuración existente. Ausente: guía local. Se acepta una clave pública publishable en el mismo campo. Nunca una service-role. |
| `transport` | Opcional `{read(): Promise<row|null>, subscribe({onRow,onStatus}): cleanup}`. Sustituye el cliente real; `null` fuerza guía local. |

## Pasos de la presentación y acciones

| Slide legacy | Paso / ruta | Anchor principal y fallback | Al entrar | CTA explícita |
| --- | --- | --- | --- | --- |
| 4 | Nueva meta / `goals` | `new-goal-btn` | Sólo navegar/resaltar | `goals:new`: abrir formulario sin guardar |
| 6 | Plan / `dashboard` | `plan-ahorro-card`; `kpi-balance` | Sólo navegar/resaltar | Resaltar plan |
| 8 | Resultado / `dashboard` | `kpi-balance` | Sólo navegar/resaltar | Resaltar resultado |
| 9 | Presupuestos / `transactions` | `presupuestos-btn` | Sólo navegar/resaltar | `transactions:budgets`: abrir panel |
| 10 | Recurrentes / `transactions` | `recurrentes-btn` | Sólo navegar/resaltar | `transactions:recurring`: abrir panel; no confirmar pagos |
| 11 | Importar / `import` | `import-csv-tab` | `import:csv`: seleccionar pestaña CSV | Repetir selección; no abrir selector de archivos ni importar |
| 12 | Cambios / `dashboard` | `generar-resumen`; `kpi-balance` | `overview:changes`: abrir cambios calculados | Repetir apertura; nunca llamar IA |
| 18 | Tenencias / `investments` | `add-holding-btn` | `investments:portfolio`: seleccionar Portfolio | `investments:new`: abrir formulario sin guardar |
| 19 | USD / `dashboard` | `toggle-usd`; `kpi-balance` | `currency:USD`: establecer USD; no alternar | Repetir selección USD |
| 20 | Vincular / `goals` | `vincular-inv-btn`; `new-goal-btn` | Sólo navegar/resaltar | `goals:link`: si existen meta y tenencia, abrir selector; si faltan, explicar o abrir formulario correspondiente sin guardar |
| 21 | Salud / `dashboard` | `score-card`; `kpi-balance` | Sólo navegar/resaltar | Resaltar salud |
| 23 | Cierre / `dashboard` | `kpi-balance` | Volver al resumen | Resaltar resultado; no abrir scanner |

Los anchors se agregan como `data-tour-target`. Las acciones de entrada deben mantenerse en el estado del padre y llegar por prop al componente de página: cambiar ruta y emitir un evento DOM inmediato puede perder la acción antes del montaje. Un `{id, nonce}` o estado de pestaña estable permite procesarla al montar. No usar la guía para disparar el viejo botón `generar-resumen`: el anchor heredado pasa a identificar los cambios calculados. La fecha elegida por el usuario se conserva; la guía no la altera ni genera registros al cambiar de pantalla.

La guía acepta los 12 índices legacy y strings numéricos. Una diapositiva activa fuera del mapa pone la guía en espera sin navegar. Anterior/Siguiente pasan a control local y no son interrumpidos por nuevos mensajes; “Volver a seguir la charla” vuelve a leer el estado. Al desactivar la presentación (`active=false`) se retoma el paso local guardado en memoria de esta sesión.

## Transporte y recuperación

Se lee `public.charla_state`, fila `id=live`, campos `id,slide,active`. La suscripción usa evento `UPDATE` y filtro `id=eq.live`, además de validar la fila al recibirla. La lectura inicial evita esperar una actualización; cada `SUBSCRIBED` vuelve a leer, incluidas reconexiones. Una respuesta anterior a un update recibido o al desmontaje se descarta. El cliente no escribe a la tabla.

El canal se libera con `removeChannel`; el componente limpia observadores, listeners de scroll/resize y resaltados. Los errores de conexión permiten continuar localmente. El tooltip se recalcula en resize, scroll de contenedores y cambios de contenido; sin anchor visible muestra una posición fija y explicación. Cuando se abre un modal, la guía se oculta para no interferir con su foco.

Fuentes consultadas: [cambios Postgres](https://supabase.com/docs/guides/realtime/postgres-changes), [subscribe](https://supabase.com/docs/reference/javascript/subscribe), [removeChannel](https://supabase.com/docs/reference/javascript/removechannel), [changelog](https://supabase.com/changelog). El endpoint changelog Markdown no fue accesible con las herramientas de esta sesión; se consultó la versión HTML. No se modificaron esquemas, RLS ni credenciales.

## Verificación

`node --test tests/tour.test.js` usa controlador real y transporte simulado: mapeo completo, modo opt-in, snapshot inicial, reconexión, alcance de fila, navegación local, cierre, descarte de lecturas viejas y posiciones desktop/móvil. No consulta ni escribe al backend real. La integración final debe recorrer los 12 anchors con datos sintéticos y vacíos, en desktop y móvil; esas verificaciones corresponden al padre después de conectar las acciones y las nuevas pantallas.
