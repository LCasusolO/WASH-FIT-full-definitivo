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

- 141 pruebas aprobadas y build correcto.
- Mismo correo y usuario disponibles tras eliminar; una nueva alta recibe otro UUID, contraseña nueva y confirmación pendiente. La contraseña y JWT antiguos no dan acceso a la cuenta nueva.
- Administrador limitado a integrantes cuyo alcance completo administra; propietarios, otros administradores y su propia cuenta protegidos. El ámbito conserva su control aunque se retiren las membresías durante la eliminación.
- Pruebas con fallos simulados de Auth y de finalización: acceso bloqueado, reintentos idempotentes y nueva cuenta intacta aun si reutilizó el correo antes de finalizar el registro antiguo.
- Compatible con cuentas eliminadas mediante el mecanismo anterior. El historial validado conserva su identidad y contenido.
- Navegador QA: opción del administrador visible para un integrante autorizado y filtro de cuentas eliminadas disponible. No se ejecutaron eliminaciones reales desde el navegador.
- Migración y Edge Function v5 aplicadas. Sondas de autorización y bloqueo de finalización anticipada comprobadas en producción mediante transacción revertida.

- Eliminación de alta interrumpida: cierra la reserva pendiente y permite reutilizar el usuario sin sufijos innecesarios.

## Evaluaciones por establecimiento — 23 de octubre de 2026

- 142 pruebas aprobadas; build correcto.
- Tabla nacional incluye establecimientos sin evaluación y asignación de equipo por fila, independiente del establecimiento seleccionado para el historial.
- Reevaluación preselecciona la última medición validada del establecimiento correcto; una medición abierta ofrece continuar en lugar de duplicarla.
- Navegador QA: creación de establecimiento pendiente, asignación desde su fila e inicio de evaluación con contexto fijo, sin selector de establecimiento.
- Orden de Usuarios comprobado: formulario, directorio y, al final, Historial de administración. Sin errores de consola.

## Códigos automáticos de reevaluación — 23 de octubre de 2026

- 144 pruebas aprobadas; build correcto.
- Cliente crea sin campo ni validación de nombre/periodo. La evaluación inicial se identifica automáticamente.
- SQL genera Reeval-001/002 por establecimiento, ignora nombres manuales enviados por clientes anteriores y conserva el código del mismo identificador de operación.
- Reintento, creación activa duplicada, referencia modificada, independencia entre establecimientos y Reeval-1000 comprobados.
- Navegador QA: creación de Reeval-001 sin nombre manual; sin errores de consola.
- Migración aplicada y comprobada en producción: asignación en servidor, bloqueo transaccional por establecimiento y función anterior sin ejecución directa del cliente.

## Permisos del mapa y coordinación del administrador — 23 de octubre de 2026

- 150 pruebas aprobadas; build correcto.

- Clic, creación y arrastre del marcador bloqueados en solo lectura, incluidos eventos tardíos y geolocalización pendiente al retirarse permisos. Se conserva la visualización de coordenadas remotas y el zoom.
- SQL comprueba que el administrador sin participación no guarda datos generales; al asignarse coordinador de un equipo propio puede guardar y conserva su rol nacional. No puede asignarse a equipos ajenos; un evaluador no puede concederse coordinación.
- Tabla de equipos permite autoasignación administrativa por país; ninguna cuenta real se reasignó durante las pruebas.
- Navegador QA con datos ficticios: mapa bloqueado, autoasignación, coordenadas editables y guardado. Caché en solo lectura y caché antigua sin permisos comprobadas con pruebas de sincronización.

## Mi cuenta y recuperación de conflictos antiguos — 23 de octubre de 2026

- 152 pruebas aprobadas; build correcto.
- Cuenta propia muestra solo sus países y equipos, incluidos roles simultáneos. No se muestra usuario/correo bajo el título ni el texto superior de gestión.
- Evaluación conserva estado de guardado y cumplimiento; se retiran los dos botones de borradores antiguos. Privacidad desaparece al contraer el menú.
- Regresión de sincronización: cambios locales de ubicación sin permiso se detectan al cargar, aun si la nube no cambió; guardar local se rechaza, aceptar nube resuelve sin escrituras y limpia la petición pendiente del mismo campo. No reaparece al reabrir.
- Navegador QA con administrador ficticio: desplegable Mi cuenta, cierre con Escape, encabezado limpio y menú contraído sin privacidad. No se borraron datos ni se resolvieron conflictos de cuentas reales.

## Acceso simplificado y cuenta en móvil — 23 de octubre de 2026

- 154 pruebas aprobadas; build correcto.
- Mi cuenta: se retiran rol duplicado en barra y países/equipos del panel; se añaden cambio de contraseña y salida al final. Ingreso sin panel narrativo.
- Pruebas de contraseña: confirmación y longitud antes de enviar, cancelación sin envío, limpieza al terminar, renovación de sesión. Cuenta activa cambia clave mediante handler y SQL reales en QA; se conservan identidad y permisos y la sesión anterior deja de administrar.
- Navegador QA: ingreso simple, menú en escritorio y móvil, apertura/cancelación del formulario sin introducir contraseñas nuevas en el navegador. No se modificaron credenciales reales.
- Evaluación a 390 px con porcentaje y sin respuestas; a 320 px no hay desbordamiento de la barra (ancho y contenido 282 px). Estado Solo lectura, con avisos de error/conflicto preservados. Consola sin errores. Tamaño del navegador restaurado al terminar.

## Ventana de contraseña, participación y nombres legibles — 23 de octubre de 2026

- 155 pruebas aprobadas; build correcto.
- Cambio personal abre un dialog nativo con foco retenido, fondo inactivo, cancelación/Escape y errores dentro de la ventana. El cambio obligatorio de contraseña temporal conserva su pantalla y no permite omitirlo.
- Tarjeta País administrado retirada de la organización nacional. Administrar integrantes lleva al inicio de Usuarios y permisos y preselecciona su equipo; se limpia el aviso anterior para no cubrir el inicio.
- Selector por equipo: Sin participación, Coordinador y Evaluador; permiso nacional comprobado de nuevo en servidor, auditoría y protección de último coordinador existentes. El control vuelve al valor guardado si una operación falla.
- Nueva migración genera Reevaluación 01/02 por establecimiento, continúa numeración Reeval anterior, conserva reintentos y bloqueo transaccional y no trunca 1000/1001. Las mediciones históricas no se renombran.
- Migración aplicada y comprobada en Supabase: formato legible, mínimo dos dígitos, compatibilidad anterior y bloqueo por establecimiento; ejecución anónima deshabilitada. Asesores sin avisos nuevos.
- Navegador QA: ventana en escritorio y 390 px, Escape y consola sin errores; selección Coordinador → Evaluador, navegación de integrantes con inicio a 24 px y foco correcto; creación de Reevaluación 01. No se modificaron contraseñas ni asignaciones reales. Vista del navegador restaurada.

## Inicio directo y gestión en organización — 23 de octubre de 2026

- 158 pruebas aprobadas; build correcto. Inicio directo sin nombre manual ni formulario intermedio; consulta reciente evita duplicar mediciones abiertas. Casos de varios equipos, referencia validada más reciente, contexto de fila y denegación a evaluador/otro país.
- Organización cambia de nombre por rol. Países y administradores incluye total y lista de establecimientos. Transferencia y participantes se trasladan a la tabla de organización; validaciones históricas y permisos existentes se conservan.
- Navegador con SQL real y cuentas ficticias: asignación en organización, inicio directo hasta index.html, única acción Continuar para la medición activa, retiro/restauración de evaluador y transferencia al equipo asignado desde la nueva ubicación. Propietario ve total y listado; evaluador ve participantes sin botones administrativos. Consola sin errores. Vista móvil 390 px sin desbordamiento de página (documento 375 px); vista restaurada. No se modificaron cuentas ni evaluaciones reales.

## Transferencia entre equipos y directorio final — 23 de octubre de 2026

- 160 pruebas aprobadas y build correcto. SQL real comprueba transferencia a equipo no asignado, asignación atómica, reintento idempotente, operación reutilizada con otro contenido, versión obsoleta, equipo actual, equipo sin coordinador/inactivo/de otro país y rechazo a coordinador sin administración. Verifica cambio de participantes y permisos de edición, conservación del registro y único evento de transferencia.
- Opciones del navegador limitadas a otros equipos activos del país con coordinador. El directorio final incluye equipos sin integrantes y restringe los equipos por rol.
- QA en navegador con cuentas y datos ficticios: otro equipo no asignado aparece en el selector; transferencia completa, nuevo coordinador activo y participantes anteriores retirados. Tabla final con integrantes y roles. Borde superior de cada encabezado de medición comprobado en 0 px. Consola sin errores. Ninguna asignación real fue modificada durante las pruebas.

## Evaluador, confirmación y reporte original — 23 de octubre de 2026

- 164 pruebas aprobadas y build correcto. Pruebas del reporte verifican seis pasos, tablas, radar, nombres y escape de HTML; cliente comprueba descarga de ambos archivos mediante WashChrome y mismo nombre. Drive conserva nombres y restringe búsquedas al identificador de exportación para no sobrescribir otro trabajo.
- PDF de QA generado con Google Chrome real (productor Skia/PDF m155), 10 páginas con datos ficticios. Renderizado con Poppler; revisión visual de datos generales, plan, monitoreo y radar. Coordenadas de snapshot conservadas; no se solicitan mapas externos al exportar en servidor.
- Navegador con evaluador ficticio: la organización muestra solo el directorio con equipo, integrantes, roles y establecimiento. Confirmación de correo centrada, diferencia entre centros de botón y formulario igual a 0 px. Consola sin errores. No se enviaron correos ni se exportaron datos reales durante estas pruebas.
