# Validación de la entrega

Fecha: 22 de octubre de 2026. Entorno: Windows, Node 24.13.1, npm 11.8.0 y Google Chrome instalado localmente. La carpeta de entrega no contiene el historial `.git` del origen.

| Comprobación | Resultado |
| --- | --- |
| `npm ci --ignore-scripts` | Instalación reproducible de 68 paquetes; auditoría npm: 0 vulnerabilidades reportadas en esa ejecución. No equivale a auditoría integral de seguridad. |
| `npm test` sin Chrome explícito, origen | 89 aprobadas, 2 omitidas por plataforma, 0 fallidas. |
| `npm test` con `WASH_CHROME_EXECUTABLE`, origen | 91 aprobadas, 0 omitidas, 0 fallidas. |
| `npm test` con Chrome, paquete independiente | 91 aprobadas, 0 omitidas, 0 fallidas; prueba histórica funcionando con fixture. |
| `npm run build`, paquete independiente | Correcto; genera recursos locales, revisión y salida `dist`. |
| Navegador contra `dist` servido localmente | Correcto, sin excepciones JavaScript registradas. |
| Editar establecimiento/país y recargar | Borrador recuperado desde IndexedDB real. |
| Siguiente Dominio sin completar respuestas | Permanece en dominio actual y marca hallazgo requerido. |
| Importación de JSON por el campo de archivo | Datos aplicados y guardados correctamente. |
| Reporte con JSON sintético | Seis secciones presentes; API local genera PDF real desde HTML del reporte. |
| Drive sin credenciales | Respuesta 503; no se declara activado. |
| Vista de reporte a 1440 y 393 píxeles | Capturas inspeccionadas; contenido inicial visible. No es una revisión exhaustiva de todas las pantallas. |
| Recarga offline tras instalar el worker | Interfaz y recursos del build cargan; borrador importado se conserva. |

Las pruebas de Chrome también ejercitan varias generaciones simultáneas, un render fallido y la liberación de perfiles temporales. La comprobación del navegador usó datos sintéticos y una sesión aislada. No se escribieron archivos en Google Drive.

Evidencia conservada: `evidencia/pruebas.txt`, `evidencia/build.txt`, `evidencia/navegador.json` y `evidencia/github-review.json`. El mensaje «Chrome unavailable» en las pruebas proviene de una falla simulada intencional para comprobar el manejo de errores; el resumen final tiene cero fallos.

Los logs se capturaron en PowerShell y se normalizaron a UTF-8. Las fechas/horas impresas por el equipo de ejecución no deben interpretarse como validación del huso horario de todos los clientes.

Pendiente: Drive con autorización real, nuevo despliegue Vercel y Chromium empaquetado en Linux, Safari/iPhone, reportes de tamaño máximo con muchas fotos e historiales, todas las combinaciones visuales y una validación sanitaria independiente del catálogo. Tampoco se garantiza la identidad exacta JSON/HTML si el usuario edita durante las esperas de preparación del reporte.

Para repetir la comprobación del navegador se requiere servir el resultado `dist` y sus API con el origen local permitido, usar Chrome y una sesión nueva; los pasos revisados aparecen en `evidencia/navegador.json`. El script temporal de automatización no forma parte del producto.
