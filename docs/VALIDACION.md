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


## Validación de la extensión colaborativa — 22 de octubre de 2026

- Suite completa: **104 pruebas aprobadas**, sin fallos ni omisiones, con Chrome
  local configurado para las pruebas reales de PDF.
- Build de producción completado y plantillas Vue compiladas.
- Migraciones ejecutadas en PostgreSQL embebido, con roles y RLS reales.
- Aislamiento por país y evaluación; lectores sin escritura; acceso revocado
  también bloqueado en historial, snapshots y reintentos de operaciones.
- Versiones obligatorias, conflictos concurrentes y reintentos idempotentes.
- Respuesta perdida después del commit: el reintento no duplica la operación.
- El conflicto persiste tras refrescar y requiere resolución explícita.
- Cambios sin conexión conservados y sincronizados al recuperar el servidor.
- Validación y corrección conservan versiones anteriores exportables.
- Monitoreo del paso 5 y plan vigente independientes de la puntuación inicial.
- API de PDF y Drive rechazan sesiones o exportaciones no autorizadas.
- QA manual de interfaz con dos cuentas ficticias: recuperación de la misma
  evaluación, acción de mejora y monitoreo guardado/revisado/validado.
- JSON y PDF de expediente descargados desde la interfaz: un monitoreo validado
  y una acción. El fallo simulado de Drive no impidió las descargas y habilitó
  el reintento. Sin datos ni credenciales reales.

Pendiente de activación externa: comprobar con el proyecto Supabase real los
correos, Storage, transporte Realtime y archivado autenticado en el Drive real.
El servidor de QA no sustituye esta verificación de servicios de producción.


## Instalación en Supabase alojado — 22 de octubre de 2026

Proyecto `wkchpmqeeyoqupuilrqh` activo en `us-east-1`. Tres migraciones
aplicadas correctamente; 16 tablas públicas de aplicación con RLS activado,
bucket de evidencias privado y cinco tablas inscritas en Realtime.

El RPC público usa los privilegios del llamante y delega en una función privada
que valida permisos. Los usuarios anónimos no pueden ejecutar el RPC. Se
comprobó mediante HTTP real que consultar países y tratar de crear uno sin
sesión devuelve 401/42501. No se insertaron datos de prueba en el proyecto.

Los asesores de seguridad y rendimiento no muestran advertencias ni errores.
Queda un aviso informativo de RLS sin políticas en `wash_private.catalog_keys`: es
un catálogo privado sin acceso directo para clientes. Los avisos informativos
de índices sin uso corresponden a la base nueva, aún sin actividad.

No hay cuentas Auth registradas ni propietario asignado. Quedan pendientes
SMTP, URLs de Auth, conexión y despliegue en Vercel, y la prueba completa con
cuentas verificadas, evidencias, Realtime y Drive. Estas comprobaciones de
infraestructura no acreditan todavía el flujo multiusuario en producción.


## Verificación del despliegue del PR #2

El commit de producción `bbfd008` quedó Ready en Vercel. La descarga HTTP directa
entrega el HTML y JavaScript nuevos. Sin embargo, en la sesión del navegador de
revisión la misma URL de JavaScript con `?v=0fdde56cec3c` todavía mostró el código
anterior. Se reprodujo rol vacío y ausencia de confirmación al pulsar Actualizar,
con aviso Vue de propiedad `accountRole` no definida. El HTML nuevo sí estaba
presente. No se determinó cuál de las capas de caché originó esa discrepancia.

La corrección del build incorpora la revisión en el nombre físico de cada recurso
enlazado, por ejemplo `platform-portal.REVISION.js`, y en su manifiesto offline.
Conserva las rutas originales para pestañas anteriores. No borra IndexedDB,
sesiones ni evaluaciones.

110 pruebas aprobadas y build correcto; las 29 referencias versionadas de ambos
HTML y todos los recursos del manifiesto offline existen. En el navegador contra
QA aislado se comprobaron el rol visible y la confirmación de Actualizar con los
archivos físicos versionados, sin errores ni advertencias de consola. La
verificación del nuevo esquema en producción requiere integrar y desplegar esta
corrección adicional.


## Cuentas administradas

121 pruebas aprobadas, build correcto y plantilla Vue compilada. El flujo de alta, confirmación simulada, cambio obligatorio e ingreso por usuario se comprobó en navegador contra el mismo SQL y handler con Auth ficticio. Las pruebas incluyen alta de administrador y evaluador, aislamiento nacional, reintentos, restablecimiento, suspensión, sesiones anteriores y pérdida de permisos de coordinador sin modificar snapshots. El registro público se desactivó en Supabase y su API devolvió 422 para un intento de alta. La infraestructura conserva las dos cuentas existentes. La confirmación SMTP de nuevas personas se completará cuando sus destinatarios utilicen el aplicativo; no se crearon cuentas de prueba en producción.

## Alta por rol — 23 de octubre de 2026

- Suite completa: **126 pruebas aprobadas**, sin omisiones, y build correcto.
- Formulario: nombre completo, correo, rol, país/equipo y usuario automático al final.
- Generación en servidor con prefijos por rol, eliminación de tildes, sufijos únicos y reintentos idempotentes.
- Lector retirado de API y restricciones de asignaciones vigentes. Sin conversión automática a permisos de edición.
- Confirmación de correo, contraseña obligatoria, recuperación sin registro y eliminación/restauración siguen verificadas.
- Generación de usuario comprobada en Supabase con transacción revertida y formulario revisado en navegador QA.

## Navegación dentro de la evaluación — 23 de octubre de 2026

- 129 pruebas aprobadas, sin fallos ni omisiones; build correcto.
- Pasos 4 y 5 abiertos dentro de la evaluación, sin redirección y sin omitir la validación del dominio.
- Paneles con contexto de evaluación y establecimiento y formularios separados por paso.
- Navegador QA: alta y guardado de una acción, conservación de borrador al alternar pasos, apertura de monitoreo y retorno al establecimiento correcto.
- Retorno bajo Exportar/Importar; franja superior y accesos duplicados retirados.

## Restauración de pasos originales — 23 de octubre de 2026

- **132 pruebas aprobadas**, sin omisiones, y build correcto.
- Se sustituyeron los paneles añadidos anteriormente por las tablas originales de los pasos 4 y 5.
- Navegador con evaluación validada: los seis botones de Instrucciones abren sus pasos; no aparece la fila extra de dominios.
- Edición del plan, nueva revisión e historial comprobados tras recargar; la puntuación inicial permanece intacta.
- Regresión cubierta: una sincronización durante el diálogo no deja la revisión en un objeto obsoleto.
- Exportación con monitoreo independiente, RLS, snapshots validados intactos y reintento idempotente comprobados en SQL.

## Diseño visual del portal — 23 de octubre de 2026

- **133 pruebas aprobadas**, sin fallos ni omisiones, y build correcto.
- Revisión en navegador de acceso, mostrar/ocultar contraseña, ayuda, evaluaciones, organización y usuarios con datos ficticios.
- Revisión móvil a 390 px: selectores apilados y cuatro pestañas en dos columnas.
- Copia de credenciales comprobada con contraseña temporal y denegación del portapapeles.
- Se conservan los permisos, el registro cerrado y las tablas originales de los pasos 4 y 5.

## Directorio de usuarios en tabla — 23 de octubre de 2026

- Directorio y buscador al final de Usuarios y permisos, después de los formularios y el historial.
- Una fila por cuenta: identidad, correo, estado, roles/ámbito y acciones desplegables; se conservan las condiciones de autorización.
- Revisión con propietario y administrador ficticios: búsqueda por nombre, búsqueda sin coincidencias y apertura del editor de rol sin modificar permisos.
- Tabla con encabezados semánticos, contador de resultados y desplazamiento horizontal para pantallas pequeñas.
- 133 pruebas aprobadas y build correcto.

## Plataforma global por rol — 22 de octubre de 2026

- 136 pruebas aprobadas, sin fallos ni omisiones; build correcto.
- Tabla general con dos establecimientos: el contexto seleccionado no altera la exportación ni los permisos de otra fila.
- SQL comprueba separación de creación global/nacional y mantiene aislamiento por país y equipo.
- Navegador QA: cuatro KPI sin filtros superiores; tabla de evaluaciones y opciones de cada fila; propietario limitado a países/administradores; administrador crea establecimiento; coordinador consulta integrantes.
- Migración aplicada y restricciones comprobadas en producción mediante una transacción revertida, sin crear cuentas ni establecimientos reales.

## Eliminación y reutilización del correo — 22 de octubre de 2026

- 140 pruebas aprobadas y build correcto.
- Mismo correo y usuario disponibles tras eliminar; una nueva alta recibe otro UUID, contraseña nueva y confirmación pendiente. La contraseña y JWT antiguos no dan acceso a la cuenta nueva.
- Administrador limitado a integrantes cuyo alcance completo administra; propietarios, otros administradores y su propia cuenta protegidos. El ámbito conserva su control aunque se retiren las membresías durante la eliminación.
- Pruebas con fallos simulados de Auth y de finalización: acceso bloqueado, reintentos idempotentes y nueva cuenta intacta aun si reutilizó el correo antes de finalizar el registro antiguo.
- Compatible con cuentas eliminadas mediante el mecanismo anterior. El historial validado conserva su identidad y contenido.
- Navegador QA: opción del administrador visible para un integrante autorizado y filtro de cuentas eliminadas disponible. No se ejecutaron eliminaciones reales desde el navegador.
- Migración y Edge Function v5 aplicadas. Sondas de autorización y bloqueo de finalización anticipada comprobadas en producción mediante transacción revertida.
