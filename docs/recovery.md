# Fuente recuperada

Se recuperó el trabajo local posterior a GitHub desde `finanzas-pro-ai-deploy`, en la rama local `codex/mangos-single-deploy`, commit `2fd65218379edf4a159664fe76f8187e95026663`, incluyendo los cambios sin commit de `src/App.jsx`, `api/ai.js` y `api/price.js`. La carpeta original no fue modificada.

El deployment proporcionado por el usuario es `dpl_2eF5WSNzqFZztVF4a6xnDTPwVLT9` (`finanzas-j1e3z3emn-gabomrtz.vercel.app`). Su HTML referencia `assets/index-CS0aWaVL.js`. La compilación limpia de la fuente recuperada reproduce exactamente el artefacto local conservado con ese nombre: 811888 bytes, SHA-256 `70c737fb774a583179ef4b7609f64b59e1b0d96cb4ee7800016d456f9337e054`. Vercel no informa SHA Git en la metadata recuperada. La descarga directa del asset remoto fue redirigida a autenticación; no se afirma comparación binaria con el asset remoto.

La fuente recuperada contiene los contratos del PR #1 y mejoras posteriores de UI, tipos de movimientos, ingresos mensuales, salud financiera y cotizaciones. El diff respecto de `bcb55dee7b6ff81c68504c9723d81d1fbd5f4895` conserva `src/aiClient.js`, `src/main.jsx` y las dependencias de ese PR; `api/ai.js` y `api/price.js` incluyen mejoras posteriores registradas como parte de la recuperación.

Baseline: `pnpm install --frozen-lockfile --ignore-scripts` y `pnpm build` pasan. El build inicial informa un bundle principal grande. No había suite de pruebas.

Antes de publicar, verificar la pareja exacta de commits app/presentación y conservar referencias de los dos deployments previos. Revertir código no revierte los datos personales.
