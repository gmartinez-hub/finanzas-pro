# Verificación de Mangos 2.1

Fecha: 2026-09-16. Datos sintéticos exclusivamente, en `127.0.0.1`, separados de la instalación personal.

## Comprobaciones automatizadas

`pnpm check` ejecuta 87 pruebas de dominio financiero, importación, almacenamiento, demostración, cotizaciones y recorrido; después ESLint y compilación Vite. El lector PDF y su worker se empaquetan desde PDF.js 6.3.289 y se cargan a demanda. El build conserva un aviso de tamaño del paquete principal; no bloquea la compilación.

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
