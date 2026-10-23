# Arquitectura y archivos

Aplicación Vue 3 sin componentes SFC ni empaquetador de JavaScript. `index.html` contiene la plantilla y `js/app.js` concentra el estado reactivo y la interacción. Tailwind se compila en el build. El servidor usa funciones CommonJS de Node.

| Archivo o carpeta | Responsabilidad y decisión |
| --- | --- |
| `index.html` | Interfaz, instrucciones, formularios, modales y reporte imprimible. Conservar. |
| `js/app.js` | Navegación, filtros, autoguardado, fotos, mapas, exportación, revisiones y coordinación de Drive. Conservar. |
| `js/core.js` | Validación, normalización, fórmulas, nombres de archivo y compatibilidad JSON. Conservar. |
| `js/data/indicators.js` | Catálogo canónico y correspondencias estables de dominios. Conservar. |
| `js/storage.js` | IndexedDB `wash-fit-drafts`, almacén `drafts`; claves `current`, `backup` y `lastArchive`. Conservar. |
| `js/chrome-report.js` | Serialización HTML, imágenes incorporadas, compresión, PDF del servidor e impresión local. Conservar. |
| `js/drive-archive.js` | Subida por fragmentos, reanudación y confirmación del par JSON/PDF. Conservar. |
| `js/report-radar.js` | SVG del radar con etiquetas escapadas. Conservar. |
| `js/pdf-report.js` | Definición anterior de reporte; ya no se carga en la web ni se publica en `dist`. Se conserva porque cuatro archivos de pruebas la importan. No es el generador activo. |
| `api/chrome-report.js` | Convierte HTML comprimido en PDF con Playwright/Chromium, sin JavaScript ni red. |
| `api/drive-archive.js` | OAuth del propietario, sesiones firmadas, búsqueda/actualización de archivos y verificación final. |
| `css/` y `js/config/` | Estilos propios, entrada Tailwind y configuración. |
| `img/` | Barra y logo blanco usados por la web. |
| `vendor/` | Vue, Lucide y Leaflet con licencias e imágenes; CSS Tailwind generado. |
| `scripts/build.cjs` | Copia dependencias locales, compila CSS, calcula revisión y genera `dist` y service worker. |
| `scripts/sw-template.js` | Plantilla de caché. HTML online con respaldo offline; recursos de su revisión exacta. |
| `sw.js` | Resultado generado incluido para servir las fuentes localmente; regenerar con build. |
| `scripts/serve.cjs` | Servidor local en loopback y proxy directo a las dos API. No es servidor de producción. |
| `tests/` | 20 archivos de pruebas; la fixture nueva elimina la dependencia del Git antiguo. |
| `.github/workflows/checks.yml` | Instalación, pruebas y build en Ubuntu/Node 22. |
| `package.json` y `package-lock.json` | Comandos y dependencias reproducibles. Conservar ambos. |
| `vercel.json` | Salida `dist`, memoria/duración de funciones y no-cache del worker. |

## Datos

El JSON raíz tiene `schemaVersion`, `savedAt`, `generalInfo` e `indicators`. Datos generales: establecimiento, país/ciudad, nivel, tipo, ámbito, población, edades, coordenadas, saneamiento, fecha, resumen, equipo, fotos y campos JMP heredados.

Cada indicador conserva su código, puntaje, hallazgos, problema, riesgos, gravedad/probabilidad, acción, recursos, responsable, costo, fechas, seguimiento e historial. El catálogo y textos se reconstruyen desde la versión canónica: la importación no permite reemplazarlos. Una fila antigua `S_8` de contención migra a `S_8b` cuando corresponde.

Límites: importación 40 MB, 20 fotos JPG/PNG/WebP de hasta 5 MB cada una, reducción a JPEG de hasta 1.200 píxeles; equipo de hasta 100 integrantes e historial de hasta 200 revisiones por indicador. El PDF puede llegar al límite antes que el JSON.

## Flujo de reporte

Exportar descarga el JSON, prepara el HTML fuera de pantalla, solicita y descarga el PDF y archiva ambos. La descarga PDF usa el mismo Blob enviado a Drive y se inicia antes de subirlo. Reintentar el archivado reutiliza ese PDF sin descargarlo otra vez. Imprimir abre el diálogo local y ejecuta el archivado en segundo plano. El HTML incorpora estilos e imágenes; los mosaicos disponibles del mapa pueden incorporarse y los que no cargan se omiten. El radar se conserva en SVG.

`POST /api/chrome-report` acepta `htmlGzip`, valida el origen, limita la solicitud a 4 MiB y el HTML descomprimido a 40 MiB; devuelve PDF de hasta 4 MiB. Las solicitudes se serializan por instancia y cada perfil temporal se elimina al terminar, incluso ante errores.

`POST /api/drive-archive` admite `health`, `start`, `status`, `upload` y `verify`. Las credenciales OAuth solo están en el servidor. Las sesiones tienen comprobante HMAC con caducidad de una hora. Los fragmentos de hasta 1 MiB pasan por el servidor. Se verifica ID, nombre, tipo, tamaño, carpeta y grupo de ambos archivos antes de confirmar.

## Dependencias y recursos

Dependencias directas fijadas: Vue 3.5.43, Lucide 1.55.0, Leaflet 1.9.4, Playwright Core 1.64.1 y Chromium 153.0.0. Desarrollo: Tailwind/CLI 4.3.0 y fake-indexeddb 6.2.4. El requisito de Node se deriva del `engines` de Chromium instalado (`^22.17.0 || >=24.0.0`).

No se necesita un CDN para ejecutar Vue, iconos o estilos. El mapa solicita mosaicos de OpenStreetMap. `dist/` es un resultado regenerable, no la fuente que debe mantenerse. Para un build limpio, use un checkout nuevo o elimine únicamente el `dist` de su proyecto antes de compilar: el script original no limpia salidas antiguas.


## Extensión colaborativa: países, equipos y paso 5

La arquitectura local descrita arriba sigue disponible cuando `WASH_MULTIUSER`
no es `true`. La activación del espacio de trabajo requiere las migraciones de
`supabase/migrations/` y la [guía de implementación](IMPLEMENTACION-MULTIUSUARIO.md).

- `platform-portal.js` gestiona países, establecimientos, equipos, participantes,
  acciones, monitoreos y versiones validadas.
- `platform-client.js` utiliza el SDK oficial de Supabase y añade sesiones a las
  API de reportes. La clave publishable es pública; no se usa service_role.
- `platform-editor.js` integra el editor actual con guardado por indicador y por
  bloques generales, borradores aislados por cuenta, reintentos y conflictos.
- `platform-model.js` separa medición, plan y monitoreo, y realiza la combinación
  de versiones sin sobrescribir cambios concurrentes.
- `wash_command` controla escrituras transaccionales, permisos actuales, versiones
  e idempotencia. Las tablas no aceptan escrituras directas del navegador.
- Los snapshots conservan mediciones y planes a una fecha de corte. Las acciones
  y monitoreos del establecimiento continúan después de validar una medición.
- `platform-report.js` prepara reportes desde snapshots autorizados. Las API de
  Chrome y Drive verifican sesión y exportación en modo colaborativo.
- Los recibos de Drive quedan vinculados al usuario y exportación. Cada versión
  exportada usa UUID propio, evitando colisiones por nombre de establecimiento.

Las evidencias del bucket privado se conservan sin sobrescritura ni borrado desde
el navegador, para mantener los documentos históricos. El administrador debe
establecer la política de retención y el mantenimiento de respaldos.


## Cuentas administradas

`/api/accounts` comunica el navegador con la Edge Function `wash-accounts`. La función valida la identidad con Supabase Auth y utiliza un RPC reservado a `service_role` para aplicar las reglas de administración por país. Las credenciales privilegiadas permanecen en Supabase. `wash_accounts`, las políticas RLS y los controles de sesión bloquean cuentas suspendidas y cambios de contraseña pendientes. El registro público está cerrado y los flujos anteriores de invitación quedan deshabilitados. Véase `CUENTAS-ADMINISTRADAS.md`.
