# WASH FIT v2.0

Aplicación en español para registrar establecimientos, evaluar condiciones WASH, valorar riesgos, elaborar planes de mejora y conservar revisiones. Incluye siete dominios, reporte de seis secciones, respaldo JSON, guardado local y archivo opcional JSON/PDF en Google Drive.

Esta entrega consolida `main` de [LCasusolO/WASH-FIT-full](https://github.com/LCasusolO/WASH-FIT-full/tree/a58247f7e585444f8dfa2169edef971f15a6cbf9), commit `a58247f7e585444f8dfa2169edef971f15a6cbf9`, revisado el 22 de octubre de 2026. No es una release oficial del repositorio de origen.

## Espacio de trabajo colaborativo

La entrega agrega países, establecimientos, equipos con coordinador responsable,
cuentas, permisos, edición compartida, plan vigente, monitoreo del paso 5 y
reevaluaciones integrales independientes. Validar una medición no bloquea el
monitoreo posterior. Las versiones validadas se conservan.

La activación requiere Supabase y las variables de Vercel; el modo local permanece
mientras `WASH_MULTIUSER` no sea `true`. Sigue la
[guía completa de implementación](docs/IMPLEMENTACION-MULTIUSUARIO.md).
Las migraciones están en `supabase/migrations/` y el alta inicial del propietario
en `supabase/crear-propietario.sql`. No subir credenciales al repositorio.

## Ejecutar

Requiere Node.js 22.17 o posterior de la rama 22, o Node.js 24 o superior, y npm. Node 20 no cumple el requisito de Chromium 153. Las dependencias están fijadas en `package-lock.json`.

```sh
npm ci --ignore-scripts
npm test
npm run build
npm run serve
```

Abrir `http://127.0.0.1:8765`. El servidor local sirve las fuentes y las API de reportes y plataforma. El build genera `dist/`, recursos locales versionados y `sw.js`. No abra `index.html` con doble clic.

En Windows/macOS, para generar PDF desde la API local, defina `WASH_CHROME_EXECUTABLE` con la ruta de Chrome y `WASH_APP_ORIGIN=http://127.0.0.1:8765` antes de iniciar el servidor. `scripts/serve.cjs` no carga `.env` automáticamente. Google Drive necesita credenciales adicionales. La impresión del navegador puede usarse por separado.

## Publicar y trasladar

Suba el contenido de esta carpeta a la raíz del nuevo repositorio, incluyendo `.github`, `.gitignore` y `.env.example`. Vercel usa `vercel.json`: instalación con npm, build y salida `dist/`; las funciones están en `api/`. Un alojamiento exclusivamente estático no ejecuta esas funciones. Consulte [Migración](docs/MIGRACION.md) y [Google Drive](docs/activar-drive.md).

El repositorio nuevo no copia configuraciones, secretos ni despliegues del anterior. Configure siempre su origen y carpeta de Drive: el código conserva valores de respaldo del proyecto anterior por compatibilidad.

## Documentación definitiva

| Documento | Contenido |
| --- | --- |
| [Análisis](docs/ANALISIS.md) | Alcance de la revisión, hallazgos y límites de validación |
| [Arquitectura](docs/ARQUITECTURA.md) | Responsabilidad de archivos, datos, API y construcción |
| [Reglas funcionales](docs/REGLAS-FUNCIONALES.md) | Puntajes, aplicabilidad, JMP, riesgos y revisiones |
| [Migración](docs/MIGRACION.md) | Nuevo repositorio, despliegue y traslado de evaluaciones |
| [Activar Drive](docs/activar-drive.md) | Variables, autorización y operación actual |
| [Evaluación sin puntaje](docs/evaluacion-sin-puntaje.md) | Explicaciones libres y compatibilidad |
| [Procedencia](docs/PROCEDENCIA.md) | Cambios hechos al preparar este paquete |
| [Validación](docs/VALIDACION.md) | Resultados reproducibles y comprobaciones pendientes |
| [Inventario](docs/INVENTARIO.csv) | Decisión y huellas de cada archivo original y añadido |

El catálogo canónico es `js/data/indicators.js`: 100 filas, 99 evaluables y una instrucción (`S_8`). No se ha añadido un Excel ni un PDF metodológico original: no estaban en la versión actual del repositorio.

## Datos y uso sin conexión

«Exportar» descarga el JSON y, cuando el servidor termina de generarlo, el reporte PDF con el mismo nombre base. Ese mismo PDF se archiva en Drive. La descarga del PDF se inicia antes de la subida, por lo que un fallo de Drive no impide conservarlo localmente; requiere conexión con el servidor para generarlo. El navegador puede solicitar permiso para descargar varios archivos.

La [política de privacidad](privacidad.html) está disponible sin iniciar sesión y enlazada en el menú lateral, debajo de «WASH FIT v2.0 • OPS 2026». Tras desplegar, use la URL pública terminada en `/privacidad.html` en Google Auth Platform. La página y su hoja de estilos se incluyen en el build y la caché offline.

En la plataforma, el borrador y las operaciones pendientes se conservan en IndexedDB por usuario y evaluación. Después de la primera apertura con conexión se puede cerrar y reabrir sin internet; al reconectarse se reintenta la sincronización por campo. Se conservan los cambios en campos diferentes y, en el mismo campo, prevalece la última versión guardada en el servidor. El identificador de operación evita duplicar un guardado cuya confirmación se perdió. El JSON exportado usa `schemaVersion: 2`.

El almacenamiento local no se traslada al cambiar de dominio, navegador o dispositivo. Sincronice los pendientes antes de cambiar de entorno. En la plataforma, las exportaciones pendientes de archivar en Drive también se conservan en IndexedDB para reintentarlas; los archivos ya confirmados permanecen en Drive.

La interfaz funciona sin conexión después de su primera carga por HTTPS o localhost y la instalación del service worker. Los mapas requieren internet; las API de PDF y Drive requieren servidor y conexión. Las actualizaciones de recursos se activan en segundo plano y no recargan la evaluación abierta.

El [informe de carga y sincronización](docs/CARGA-COORDINADA.md) documenta las pruebas concurrentes, los fallos encontrados, las correcciones y el alcance de las mediciones. El número de evaluadores no debe interpretarse sin considerar ritmo de edición, establecimientos activos, renovación de sesiones y límites por IP.

## Licencias

El proyecto original no declara licencia general. Esta entrega no añade una licencia ni presupone autorización institucional. Se conservan los avisos de terceros en `vendor/` y los recursos gráficos que usa la interfaz. La identidad visual y el catálogo requieren la validación que corresponda al propietario.
