# Mangos

Organización financiera personal y apoyo para charlas: movimientos, resultado mensual, metas, inversiones con las integraciones de cotizaciones, IA y presentación conectada. React/Vite, con funciones puras para los cálculos y almacenamiento local versionado. La presentación Charla se mantiene en un repositorio separado; el protocolo compartido está en [docs/tour-integration.md](docs/tour-integration.md).

## Desarrollo reproducible

La versión de referencia es Node **24.20.0**, fijada en `.nvmrc` y CI, con pnpm **11.19.0** fijado en `package.json`. El rango de compatibilidad local admite Node desde 24.19.0 hasta la próxima versión mayor; los controles de CI siempre usan 24.20.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Copiar `.env.example` a `.env.local` sólo si se necesitan integraciones. Vite inicia el frontend; las rutas `api/` necesitan un entorno de funciones compatible para la IA y las cotizaciones. Los cálculos, carga manual y CSV funcionan sin una clave de IA.

```sh
pnpm test
pnpm lint
pnpm build
pnpm check
```

`pnpm check` ejecuta pruebas con `node:test`, ESLint y compilación. ESLint verifica referencias indefinidas, incluido JSX, y errores de ejecución; permite código legado sin usar durante la extracción gradual de módulos. El lockfile es parte de la entrega. Las dependencias directas tienen versiones exactas; no se usan instalaciones de `latest`.

## Datos personales y demostración

La app abre en modo personal de forma predeterminada, sin datos de ejemplo ni avisos de demostración. Actualiza la cotización al iniciar; el resumen semanal con IA sigue disponible a pedido en Resumen, junto a Qué cambió. El espacio personal usa `fp_v3b` y la demo `mangos_demo_v1`. La demo se selecciona con `VITE_APP_MODE=demo` o `?demo=1`. Para una charla o publicación, usar **un origen o perfil de navegador separado**, con datos ficticios y sin credenciales de los endpoints facturables. Un parámetro de URL sirve para probar el modo; no es una barrera de privacidad entre orígenes ni protege por sí mismo las rutas de servidor. Una demo estática puede publicarse desde `dist/` sin desplegar `api/`.

Los datos permanecen en este navegador y origen; no se sincronizan automáticamente con otro dispositivo. Descargar periódicamente un respaldo JSON desde Ajustes. El JSON versionado incluye todo el estado; el CSV intercambia movimientos y no sustituye ese respaldo. La restauración valida el archivo, permite revisar el contenido y conserva una copia previa. También reconoce los JSON completos exportados por la versión anterior.

Un fallo de lectura no inicia una sobrescritura con datos vacíos. Los errores de espacio o escritura se muestran como cambios pendientes. La revisión guardada y el evento `storage` detectan conflictos entre pestañas; `localStorage` no tiene una transacción o bloqueo atómico entre procesos. Ante un conflicto, respaldar los cambios pendientes y recargar la versión guardada. La recuperación explícita conserva los bytes dañados.

## Significado de los importes

- `transaction.amount` sigue siendo **ARS canónico**, incluso en registros antiguos etiquetados USD. Nunca se convierte nuevamente al cargar.
- Las importaciones nuevas conservan importe y moneda originales, tasa y fecha cuando corresponden. La vista previa muestra la moneda original; la confirmación convierte una sola vez.
- Ingresos, consumo, transferencias y reservas tienen reglas compartidas. El resultado del período no se presenta como saldo bancario si faltan cuentas o saldos iniciales.
- Las cotizaciones y proyecciones no son movimientos confirmados. Los vínculos históricos ambiguos se conservan para revisión.
- Reimportar el mismo origen exacto no agrega sus filas nuevamente; dos filas legítimas iguales siguen siendo dos movimientos. Las coincidencias aproximadas no se eliminan automáticamente.

## Integraciones y seguridad

`OPENAI_API_KEY` y `TWELVE_DATA_API_KEY` pertenecen exclusivamente al servidor. Los valores `VITE_*` se incluyen en el navegador y no pueden contener secretos. La guía en vivo sólo debe conectarse de manera explícita a un proyecto Supabase con sus políticas configuradas. Antes de exponer endpoints facturables públicamente, revisar autenticación, cuotas y presupuesto; el frontend demo no reemplaza esos controles.

PDF.js se instala como dependencia fija y su worker se entrega con la aplicación. La extracción con IA envía contenido al proveedor cuando la persona ejecuta esa acción; una importación CSV local no necesita esa llamada. No agregar extractos, respaldos personales, credenciales ni capturas con datos reales a Git o a fixtures de pruebas.

La procedencia del código recuperado y sus límites están documentados en [docs/recovery.md](docs/recovery.md). Los cambios de esta entrega se realizan en un checkout aislado; no modifican el almacenamiento de un navegador personal por ejecutar los tests.
