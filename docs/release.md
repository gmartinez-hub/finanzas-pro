# Publicación coordinada de Mangos y Charla

## Alcance

Esta entrega conserva React/Vite y las funciones de inversiones/importación recuperadas, añade la interfaz cálida/fría, resumen consultable, pagos pendientes y simulación temporal. La presentación conectada sigue en `gmartinez-hub/Charla`. `CharlaV2` no se modifica.

La recuperación previa está documentada en [recovery.md](recovery.md). El PR anterior de IA no se cierra automáticamente: esta rama incluye la base recuperada y sus correcciones posteriores. Comparar su alcance antes de declararlo reemplazado.

## Revisión y despliegue

1. Ejecutar `pnpm install --frozen-lockfile`, `pnpm check` y el ensayo documentado en [verification.md](verification.md).
2. En Charla, ejecutar `npm run check`. Revisar ambas propuestas contra `main`, manteniendo los 24 índices y el protocolo `charla_state` de la fila `live`.
3. Probar las dos previews. La app usa `?demo=1` para datos ficticios y una clave de almacenamiento separada. Para seguir el vivo hay que elegirlo expresamente; abrir la presentación no publica su estado.
4. Antes de la actualización personal, descargar un respaldo completo desde la versión vigente. Mantener el mismo dominio: los datos locales pertenecen al origen del navegador, no al repositorio.
5. Publicar la app y luego Charla, sin una charla activa entre ambos despliegues. Registrar los dos SHA y los dos deployments en la descripción de la entrega. Conservar la referencia anterior de Vercel.
6. Ensayar con datos ficticios: activar “Seguir charla en vivo” en la app y después “Iniciar sincronización” en Charla; detener al terminar. Un solo presentador controla la fila compartida.

## Vuelta atrás y datos

Volver a un deployment anterior revierte código, **no datos**. La primera escritura de esta versión guarda un sobre con esquema y revisión; las versiones antiguas no lo entienden. No reabrir una versión antigua sobre datos nuevos sin preparar una restauración compatible. El adaptador conserva `fp_v3b:previous`; una recuperación de corrupción conserva además `fp_v3b:corrupt`. El respaldo descargado y esas copias deben preservarse antes de cualquier reparación. CSV sirve para intercambiar movimientos y no reconstruye relaciones de metas, pagos ni inversiones.

## Límites conocidos

- La sincronización real con Supabase y los endpoints de IA/precios se ensayan en preview con la configuración existente antes de promocionar producción; las pruebas de esta entrega no escriben el estado de la charla en vivo.
- Las reservas iniciales históricas no inventan movimientos pasados. Pagos antiguos sin vínculos suficientes requieren revisión, en vez de una reversión estimada.
- Se mantienen las URLs y repositorios. No se añaden cuentas, sincronización entre equipos ni nuevas promesas de rendimiento financiero.
