# Procedencia y cambios de preparación

Origen: `LCasusolO/WASH-FIT-full`, `main`, commit `a58247f7e585444f8dfa2169edef971f15a6cbf9`, revisado el 22/10/2026. El paquete es una consolidación técnica para iniciar un repositorio nuevo, no una release oficial ni una certificación metodológica.

Cambios respecto del árbol original:

- README sustituido por documentación vigente; `docs/activar-drive.md` corregido. Se conserva `docs/evaluacion-sin-puntaje.md`.
- `.env.example` sin carpeta/dominio específicos del proyecto anterior y con ejemplo de Chrome local.
- Node compatible declarado en `package.json`, raíz de `package-lock.json` y `.nvmrc`. No se cambiaron versiones de dependencias.
- `tests/core.test.cjs` lee `tests/fixtures/preserved-behavior.json` en lugar de ejecutar Git. La fixture contiene exactamente los tres fragmentos que la prueba obtenía de `84a71ba:js/app.js`, y registra el SHA completo. El resto de las aserciones se conserva.
- Excluidos `vendor/pdfmake.min.js`, `vendor/vfs_fonts.js`, `vendor/pdfmake-LICENSE` e `img/paho-logo.png`, sin referencias activas. Se conserva el logo blanco y la barra usados por la interfaz.
- Recursos de Vue, Lucide, Leaflet, sus licencias, Tailwind y service worker regenerados mediante el build existente y las dependencias fijadas; por eso algunas huellas difieren del árbol original.
- Añadidos análisis, arquitectura, reglas, migración, validación, inventario y evidencia. No se introdujo una licencia general.

El código funcional de `index.html`, `js/app.js`, `js/core.js`, almacenamiento, catálogo y ambas API se conserva. No se modificaron reglas JMP, suma de riesgo, filtros, formato de evaluación, esquema JSON ni política pública de Drive.

No se crearon repositorios ni commits remotos, no se desplegó y no se exportaron datos personales. El ZIP excluye `.git`, `node_modules`, `dist`, `work` y archivos de entorno privados. Mantenga el SHA del origen como trazabilidad aunque cree su primer commit desde cero.
