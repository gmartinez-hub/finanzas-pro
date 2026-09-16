# Verificación de Mangos 2.1

Fecha: 2026-09-16. Pruebas en `127.0.0.1`, separadas de la instalación personal; sin movimientos personales.

## Comprobaciones automatizadas

`pnpm check` ejecuta 95 pruebas de dominio financiero, importación, almacenamiento, demostración, cotizaciones y recorrido; después ESLint y compilación Vite. El lector PDF y su worker se empaquetan desde PDF.js 6.3.289 y se cargan a demanda. El build conserva un aviso de tamaño del paquete principal; no bloquea la compilación.

La revisión independiente encontró y corrigió: cantidades fraccionarias interpretadas como miles al editar, reservas confundidas con pagos, cotizaciones de instrumentos distintos, estados restaurados con monedas inválidas, recuperación de datos corruptos después de una sesión abierta, lotes retenidos al reiniciar la demo, comparaciones sin observaciones y el ancla de salud del recorrido.

## Recorridos comprobados en navegador

- Resumen en ARS: ingreso 1.280.000, gasto 780.000, reserva 300.000 y disponible 200.000. En USD a 1.600: 800, 487,50, 187,50 y 125; también cambian ejes y etiquetas.
- Simular un gasto de 50.000 muestra 150.000 disponibles; cerrar con Escape conserva el original y devuelve el foco.
- Abrir Movimientos no registra recurrentes. Confirmar la fecha real de la suscripción de 12.000 agrega un gasto y deja el período pagado, sin un segundo botón de confirmación.
- Reservar 100 para la meta lleva el efectivo de 300.000 a 300.100. Pagar 40 reduce el efectivo a 300.060 y conserva el avance en 300.100. Revertir restituye 300.100 y deja el pago marcado como revertido.
- Texto: `Farmacity 24 $1500` interpreta 1.500, y `USD10` conserva la moneda original. Repetir el lote informa que ya estaba importado y agrega cero movimientos.
- CSV de prueba: débito argentino `-1.234,56` y una compra de USD 10; vista previa permite revisar importe, moneda, tipo y categoría.
- Restauración JSON: vista previa de 22 movimientos, una meta y cero inversiones; confirmar recupera el resultado inicial. Recargar conserva el estado restaurado.
- Los 12 pasos del tour se recorrieron en escritorio y a 390 × 844, con navegación adelante/atrás y anclas reales. El vínculo de inversión usa la alternativa prevista cuando no hay tenencias; el paso de salud abre su panel. El tour no registra pagos ni consulta IA.
- En Charla se recorrieron las 24 diapositivas en modo local. La carga y navegación mantienen “Modo local”. La serialización de escrituras, reconexión de la app y errores devueltos por Supabase se verificaron con transportes simulados.

## Límites de esta verificación

No se hicieron consultas pagas de IA, operaciones de mercado ni escrituras en la fila pública de Supabase. La extracción con IA necesita la API de Vercel y sus variables; el servidor Vite sólo verifica la interfaz. No se atribuye a las pruebas locales una verificación del backend desplegado. La app continúa siendo de uso personal: los datos viven en el navegador y los conflictos entre pestañas se detectan de forma optimista, sin transacciones distribuidas.

## Corrección de conexiones del modo personal

La comparación con la base recuperada detectó dos regresiones de la interfaz: actualización automática del dólar y acceso al resumen semanal de IA. Se restauraron. El arranque personal sin `?demo=1` se verificó en navegador: muestra «Mi espacio personal», consulta DolarApi automáticamente y presenta fecha y cotización recibidas, sin rótulos de demostración. La referencia anterior se conserva ante errores; una respuesta tardía no pisa una edición manual ni convierte movimientos históricos.

El resumen semanal de IA vuelve a estar disponible en Resumen, junto a Qué cambió. Se reutiliza el generador existente y sus endpoints; se validaron el payload y la presencia del control habilitado. No se ejecutó una consulta paga. Cotizaciones de inversiones, scanner, análisis, comparador e importación con IA conservan sus conexiones del modo personal. La sincronización de Charla mantiene la activación explícita acordada.

El enlace de uso confirmado por el usuario es `https://finanzas-j1e3z3emn-gabomrtz.vercel.app/`. Corresponde a un despliegue versionado, no a un dominio que pueda darse por actualizado al crear otro deployment. Antes de cambiar el origen se debe exportar y restaurar el respaldo completo; la preview local no tiene acceso a su almacenamiento. Los endpoints de ese despliegue exigen autenticación de Vercel, por lo que no se declara validación funcional remota a partir del ensayo local.
