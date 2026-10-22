# Activar el archivo de Google Drive

La función usa OAuth del propietario en el servidor. No utiliza la conexión Drive de un chat y los visitantes no necesitan iniciar sesión. Esta entrega no incluye credenciales.

## Configuración

Habilite Drive API en su proyecto Google Cloud y configure un cliente OAuth web con acceso de la cuenta que puede escribir en la carpeta. El procedimiento original utiliza OAuth Playground con credenciales propias, acceso offline y el alcance `https://www.googleapis.com/auth/drive` para obtener un refresh token. Configure su redirect URI según ese flujo y verifique los requisitos de publicación de su cliente en la [documentación oficial de OAuth](https://developers.google.com/identity/protocols/oauth2/web-server).

| Variable privada del servidor | Valor |
| --- | --- |
| `GOOGLE_CLIENT_ID` | ID del cliente OAuth |
| `GOOGLE_CLIENT_SECRET` | Secreto del mismo cliente |
| `GOOGLE_REFRESH_TOKEN` | Refresh token de esa cuenta y cliente |
| `GOOGLE_DRIVE_FOLDER_ID` | ID de la carpeta de destino elegida |
| `WASH_APP_ORIGIN` | Origen exacto de la web, como `https://mi-app.vercel.app` |

No publique secretos en GitHub ni en HTML/JavaScript. No use prefijos públicos. Configure los valores en el alojamiento, y despliegue de nuevo. `.env.example` es solo una plantilla; el servidor local no la lee automáticamente. Evite depender de los valores antiguos que permanecen en los fallbacks del código.

## Operación vigente

Exportar descarga el JSON localmente y genera un PDF con Chrome desde el reporte HTML. Imprimir abre la impresión local y archiva el mismo reporte en segundo plano. Si no hay conexión o la API falla, el archivado requiere reintento.

Cada par usa el nombre normalizado país-establecimiento. Si ya existe un archivo con ese nombre y tipo en la carpeta, se actualiza el ID más antiguo; si no, se crea. Los duplicados previos no se eliminan. No se crea una copia histórica por cada pulsación. Establecimientos homónimos dentro del mismo país pueden coincidir en el nombre final.

Los fragmentos de hasta 1 MiB pasan por el servidor hacia la sesión reanudable de Google. La API de Drive admite hasta 40 MiB por archivo; antes, la API de Chrome limita a 4 MiB tanto su solicitud comprimida como el PDF de salida. El mapa puede incorporarse si sus mosaicos cargaron; no es un mapa offline garantizado.

Se confirma el par solo después de verificar ambos archivos y su carpeta, grupo, nombre, MIME y tamaño. El reintento en la misma página conserva sesiones y omite archivos ya confirmados. El trabajo pendiente está en memoria y no sobrevive a cerrar la página. Una nueva exportación toma una captura nueva.

El responsable del plan es texto independiente en la interfaz actual. El guardado local y la confirmación del archivado son estados diferentes. El mensaje completo del archivado no se muestra en todos los lugares de la interfaz; no interprete «Guardado» local como confirmación de Drive.

## Comprobar

Use una evaluación sin datos personales. Exporte y compruebe físicamente JSON y PDF en la carpeta. Abra ambos; repita después de editar y confirme que se actualizan los mismos IDs. Revise que el PDF contiene las seis secciones, fotos y radar. Pruebe un reintento tras desconexión.

`health` verifica autorización y carpeta sin crear archivos. `GOOGLE_AUTH_REQUIRED` indica autorización vencida/revocada; `GOOGLE_AUTH_CONFIGURATION`, un problema de credenciales; `GOOGLE_FOLDER_ACCESS`, carpeta o permisos. La renovación debe hacerse en el servidor.

El control `Origin` limita solicitudes desde navegadores, pero no autentica al visitante. Según el diseño heredado, el servicio acepta escrituras de visitantes con las credenciales del propietario. Si cambia el público objetivo, deberá diseñar autenticación y límites de uso antes de abrirlo; no se han cambiado aquí esas decisiones funcionales.

## Referencias de implementación

Código: `api/drive-archive.js`, `api/chrome-report.js`, `js/drive-archive.js`, `js/chrome-report.js`, `js/app.js`. Las pruebas simulan Drive: una prueba unitaria aprobada no demuestra que sus credenciales reales estén activadas.
