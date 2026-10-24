# Cuentas administradas de WASH FIT

## Uso en producción

El registro público y las invitaciones de acceso anteriores se sustituyen por creación directa de cuentas. La recuperación de contraseña no crea cuentas ni asigna permisos.

### Propietario

La cuenta propietaria existente conserva correo y contraseña y recibe el usuario `propietario`. Puede seguir ingresando con su correo.

1. Abrir `plataforma.html` e ingresar.
2. Registrar el país en **País y establecimientos** y entrar a **Usuarios y permisos**.
3. Completar nombre completo y correo.
4. Seleccionar el rol Administrador del país y el país. No requiere un equipo. El usuario se genera automáticamente al final, por ejemplo `admin-peru`.
5. Crear la cuenta y copiar la contraseña temporal mostrada en pantalla. Comunicar las credenciales personalmente por un medio privado. No se envían contraseñas por correo.

El alta global se limita a países y administradores nacionales. Los establecimientos, equipos y cuentas de integrantes los registra el administrador de cada país.

El rol Lector se retiró de formularios y operaciones administrativas. Las asignaciones antiguas de lectura se revocan sin transformarlas en permisos de edición. Los registros históricos se conservan.

### Administrador nacional

Puede registrar coordinadores y evaluadores para los equipos de sus países. No puede nombrar administradores nacionales ni modificar accesos de otros países. El directorio solo muestra las personas y asignaciones de su ámbito.

Para crear integrantes, completar nombre y correo, elegir Coordinador responsable o Evaluador, seleccionar país y equipo, y revisar el usuario generado al final. Ejemplos: `coordinador-maria-nunez` y `evaluador-luis-casusol`. Si hay coincidencias, el servidor añade un número (`-2`, `-3`, etc.). El nombre de usuario no se escribe manualmente en el alta. Las cuentas existentes conservan su usuario al recibir otro acceso.

### Vista por rol

El administrador nacional registra establecimientos, crea equipos y los asigna a establecimientos desde **Establecimientos y equipos**. El coordinador y el evaluador consultan allí los establecimientos y los integrantes de sus equipos, con controles de participantes solo si su rol lo permite.

El panel superior muestra total de países, establecimientos, equipos y evaluaciones activas (borrador, elaboración o revisión), limitado a los datos autorizados de cada cuenta. No hay filtros superiores de país/establecimiento. **Evaluaciones** muestra una tabla general con país, establecimiento, nombre, equipo, estado y opciones por fila. **Nueva evaluación** abre el formulario para un establecimiento autorizado; conserva la separación entre medición inicial y reevaluación. El portal ya no ofrece importar evaluaciones. El historial conserva su selector de establecimiento dentro de su propia sección.

### Primer ingreso

1. Ingresar con el usuario y contraseña temporal recibidos.
2. Si falta confirmar correo, pulsar **Enviar confirmación de correo** y abrir el enlace recibido.
3. Establecer una contraseña personal diferente, de 12 a 128 caracteres.
4. Solo entonces se habilitan los países y evaluaciones autorizados.

Supabase Auth valida la contraseña y el correo. SQL bloquea los datos y escrituras mientras quede pendiente el cambio obligatorio. La comprobación no depende de ocultar botones.

### Cambiar roles y retirar accesos

En cada cuenta aparecen sus asignaciones por país y equipo. **Cambiar rol** actualiza el acceso vigente y los participantes existentes del equipo; agrega los nuevos participantes únicamente a las evaluaciones abiertas. Los snapshots validados conservan sus autores y roles históricos. **Retirar este acceso** revoca una asignación concreta. No implica suspender otros accesos de la persona.

No se permite retirar al último administrador nacional o coordinador necesario. La suspensión global está reservada al propietario y protege las cuentas propietarias y al último responsable activo.

El propietario también puede editar el nombre completo y el usuario de una cuenta, incluidas las cuentas migradas, sin cambiar su correo, contraseña, identidad ni historial.

### Contraseñas, suspensión y sesiones

Las contraseñas temporales se muestran en la respuesta de creación o restablecimiento. No se guardan en tablas de WASH FIT, auditorías, archivos ni almacenamiento del navegador. Las contraseñas personales solo las procesa Supabase Auth.

Si se pierde la respuesta de una creación ya completada, la contraseña no puede volver a consultarse: generar otra temporal desde el directorio. Un alta pendiente conserva los datos no secretos y el identificador de operación en la sesión del navegador para reintentar el mismo formulario.

Restablecer una contraseña obliga a cambiarla y bloquea las sesiones anteriores mediante una fecha mínima de sesión comprobada en SQL. El cambio personal vuelve a emitir una sesión nueva. Suspender bloquea REST, Storage y RPC sin esperar a que venza el JWT. Reactivar no rehabilita sesiones anteriores. No borra copias que una persona ya haya descargado.

Un administrador nacional solo puede restablecer cuentas de integrantes cuyo alcance esté íntegramente bajo su administración y que no sean propietarios ni administradores nacionales. Las cuentas compartidas fuera de su ámbito requieren al propietario.

**Eliminar cuenta y liberar correo** bloquea las sesiones y retira las asignaciones. El correo y nombre de usuario quedan disponibles para una nueva alta con identidad y contraseña nuevas, confirmación de correo y cambio obligatorio de contraseña. La nueva cuenta recibe únicamente los accesos asignados en esa alta; no hereda la identidad ni la autoría anterior. Si se le asigna expresamente el mismo equipo, podrá consultar sus evaluaciones compartidas según su nuevo rol.

El propietario puede eliminar cuentas no propietarias. El administrador nacional puede eliminar coordinadores y evaluadores únicamente cuando todos sus accesos pertenecen a países que administra. No puede eliminar a otro administrador, a una cuenta propietaria ni su propia cuenta. Las cuentas compartidas fuera de su ámbito requieren administración global.

La identidad retirada permanece bloqueada para conservar autores, auditorías y mediciones. No se restaura. En **Ver cuentas eliminadas**, el estado **Correo y usuario liberados** confirma el cierre. Si el proceso fue interrumpido o la cuenta se eliminó con el mecanismo antiguo, use **Finalizar eliminación y liberar correo**. El reintento actúa sobre el identificador antiguo y no afecta a otra cuenta creada con el mismo correo.

La cuenta desaparece del directorio habitual. La eliminación conserva las evaluaciones y sus versiones validadas.

## Infraestructura

- Migraciones: `supabase/migrations/20261022235838_managed_accounts.sql`, `supabase/migrations/20261023010837_managed_account_lifecycle.sql` y `supabase/migrations/20261023012422_remove_reader_role.sql`.
- Edge Function: `supabase/functions/wash-accounts/index.ts` y `handler.mjs`.
- Publicar como `wash-accounts`, con `verify_jwt=false`: el ingreso y recuperación son públicos; todas las operaciones administrativas verifican el JWT con Auth y el estado de la sesión en SQL.
- La función usa las variables internas `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`. No copiar la clave administrativa a Vercel ni al navegador.
- Vercel usa las variables existentes y `/api/accounts` como proxy del mismo origen. No cambia el OAuth de Google Drive.
- Desactivar **Allow new users to sign up** en Supabase. Además, un trigger diferido al final de la transacción impide nuevas cuentas que no estén marcadas por Auth Admin como administradas. Auth Admin inserta primero el usuario y actualiza después sus metadatos; por eso no se valida en BEFORE INSERT. El SDK público no puede establecer `raw_app_meta_data`.
- El cambio de contraseña consulta el estado actual y las sesiones de Auth; las políticas RLS y Storage comprueban esos mismos requisitos.

La migración conserva las cuentas existentes, asigna usuarios únicos y mantiene el acceso previo. Revoca invitaciones pendientes y deshabilita las operaciones antiguas de invitación. Para una instalación completamente nueva, el primer propietario requiere un alta de bootstrap mediante Auth Admin con `app_metadata.wash_managed=true`, confirmación del correo, activación del perfil y `supabase/crear-propietario.sql`. No se debe habilitar el registro público para ese fin.

## Pruebas

Las pruebas de cuentas utilizan el mismo SQL y handler de producción con PostgreSQL/RLS embebido y un adaptador ficticio de Auth. Se comprueban altas, reintentos sin volver a mostrar contraseñas, confirmación, cambio obligatorio, directorio, ámbitos, recuperación sin registro, sesiones antiguas, suspensión, último responsable y conservación de snapshots al cambiar roles. El contrato histórico de invitaciones se prueba por separado contra las migraciones previas.

`node tests/support/managed-fixture.cjs` sirve QA aislado en `127.0.0.1:59441`. Usa `propietario` / `Fixture-password-123`; no conectar ese servidor a Supabase ni a Drive reales. La confirmación de correo es simulada en ese entorno.

## Comprobación de la infraestructura

La migración se aplicó al proyecto WASH FIT Definitivo y la Edge Function quedó activa. Se conservaron las dos cuentas existentes y el propietario activo. Se verificó por HTTP que el registro público devuelve `Signups not allowed for this instance`, que listar cuentas sin sesión devuelve 401 y que un usuario inexistente no puede ingresar. El RPC administrativo no es ejecutable por `anon` ni `authenticated`.

Los asesores no indican errores de RLS ni funciones administrativas públicas. Supabase advierte que la protección contra contraseñas filtradas está desactivada; el panel la ofrece en planes Pro o superiores. Se mantuvo el plan actual. Los avisos informativos de catálogo privado e índices sin uso corresponden a la configuración existente y a tablas nuevas.

### Establecimientos y evaluaciones del administrador

En **Evaluaciones**, el administrador ve una fila por establecimiento de los países que administra, aunque todavía no tenga mediciones. El estado distingue falta de evaluación, una medición abierta o un establecimiento evaluado. Desde esa fila puede continuar la medición abierta, iniciar la primera o reevaluar tras validar la anterior. Iniciar crea y abre directamente la medición con el equipo ya asignado; si hay varios equipos asignados, se elige entre ellos en la misma fila. Antes de crear se consulta el estado actual para continuar una evaluación abierta sin duplicarla. La reevaluación usa la última medición validada como referencia y recibe su nombre automático. Exportación y revisión permanecen en Evaluaciones. La asignación de equipos, transferencia y participantes se gestionan en Establecimientos y equipos.

En **Usuarios y permisos**, los formularios y el directorio aparecen antes del **Historial de administración**, que queda al final tanto para el administrador como para la administración global.

### Identificación automática de las evaluaciones

El formulario ya no pide nombre ni periodo. La primera medición se crea como **Evaluación inicial**. Las nuevas reevaluaciones reciben **Reevaluación 01**, **Reevaluación 02**, etc., en una secuencia independiente para cada establecimiento. El servidor asigna el código al guardar; el navegador no lo elige. Un reintento conserva el mismo código y no consume otro número. Los nombres y snapshots anteriores se conservan.

### Administrador y coordinador de un equipo

El administrador puede mantener su rol nacional y participar como coordinador de un equipo específico de su país. En **Establecimientos y equipos → Equipos del país**, elija **Coordinador**, **Evaluador** o **Sin participación** en el selector de la columna Mi participación. Cada equipo conserva una asignación independiente. El servidor impide dejar al equipo sin coordinador. La operación utiliza el servicio administrativo existente, queda auditada y actualiza los participantes de las evaluaciones abiertas del equipo. No reemplaza a los otros coordinadores ni crea una cuenta nueva.

El rol de administrador por sí solo permite consultar el mapa, desplazarse y usar el zoom, pero no modificar la ubicación. Para editar coordenadas, pulsar en el mapa, arrastrar el marcador o usar la geolocalización, la cuenta debe ser participante activo como coordinador o evaluador de esa evaluación y esta debe estar en borrador o edición. Las mediciones en revisión o validadas continúan en solo lectura. La caché offline conserva los permisos previamente comprobados; una caché antigua sin ese dato se abre en solo lectura hasta verificarlos en línea.

### Mi cuenta y cambios locales anteriores

El botón **Mi cuenta** abre un desplegable con nombre, usuario, correo, estado y rol principal. El rol solo aparece dentro del desplegable; países y equipos permanecen en sus secciones correspondientes. Puede cerrarse con el mismo botón o con Escape. Al final están **Cambiar contraseña** y, separado, **Cerrar sesión**. El encabezado ya no repite datos personales ni tiene otro botón de salida.

La evaluación ya no ofrece Nueva evaluación ni Recuperar respaldo anterior. Las nuevas mediciones se gestionan desde la plataforma. Al contraer el menú, se oculta el enlace de privacidad; continúa disponible al expandirlo.

Si el navegador conserva coordenadas u otros datos distintos de la nube, el aviso permite descargar una copia JSON local antes de elegir la versión de la nube. En modo de consulta no se ofrece guardar la versión local. Al aceptar la nube se elimina también cualquier petición pendiente del mismo campo; no se vuelve a intentar enviar el dato descartado.

### Acceso, cambio de contraseña y estado de consulta

La pantalla de acceso presenta únicamente el formulario de ingreso, recuperación y ayuda, sin el panel descriptivo de pasos. Desde **Mi cuenta → Cambiar contraseña** se abre una ventana emergente con nueva contraseña y confirmación (12 a 128 caracteres). La plataforma conserva su posición detrás de la ventana; cancelar o Escape la cierran sin enviar datos. Cancelar limpia ambos campos sin enviar nada. Se reutiliza el servicio de cambio personal existente: conserva identidad y permisos y renueva la sesión. El cambio obligatorio de una contraseña temporal continúa siendo obligatorio y no ofrece cancelación.

En la evaluación, el estado de consulta muestra **Solo lectura**. Los errores de conexión conservan el borrador y muestran el estado pendiente de sincronizar. El cumplimiento y el estado se distribuyen sin comprimir las etiquetas en móvil y escritorio.

### Administración y navegación de integrantes

La sección Establecimientos y equipos del administrador ya no muestra la tarjeta ni el selector de país administrado; usa automáticamente el país asignado. **Administrar integrantes** abre Usuarios y permisos desde su inicio y deja seleccionado el equipo de la fila para crear o asignar cuentas.

El formato nuevo de reevaluación continúa la numeración de nombres anteriores como Reeval-001. Las mediciones históricas y sus snapshots conservan su nombre; los reintentos de operaciones anteriores siguen devolviendo el resultado original.

### Organización por rol

Para la administración global, la sección se llama **País y establecimientos**. Países y administradores incluye el total de establecimientos de cada país y permite desplegar su lista. Para administradores, coordinadores y evaluadores se llama **Establecimientos y equipos**. La tabla reúne equipos asignados, transferencia del equipo responsable y participantes de cada medición. Solo los roles autorizados reciben controles de modificación; las mediciones validadas conservan sus participantes históricos. En Evaluaciones queda un único enlace para continuar cada medición abierta.

### Transferencia a otro equipo del país

En Establecimientos y equipos, Transferir equipo responsable ofrece los otros equipos activos del mismo país que tienen coordinador, aunque todavía no estén asignados al establecimiento. La confirmación asigna el nuevo equipo al establecimiento y transfiere el acceso a la medición en una sola transacción. Si hay conflicto de versión o falta permiso, no queda una asignación parcial. El equipo actual se excluye de las opciones. Los participantes anteriores quedan retirados de esa evaluación; se conserva la autoría y las versiones históricas. Las asignaciones anteriores al establecimiento se mantienen, porque pueden seguir interviniendo en su plan y monitoreo.

Al final de la organización, Integrantes de los equipos muestra equipo, integrante, rol, establecimientos y país. Incluye equipos sin integrantes. El propietario consulta todos; el administrador, los de su país; coordinadores y evaluadores, sus propios equipos. Los encabezados desplegables de cada medición ya no muestran una línea superior.

### Vista del evaluador y reporte original

Para una cuenta que solo participa como evaluador, Establecimientos y equipos muestra únicamente el directorio de sus equipos, integrantes, roles y establecimientos. La gestión de evaluaciones y participantes queda disponible en esta sección para los roles que la necesitan. En el ingreso, Enviar confirmación de correo queda centrado.

La exportación multiusuario reutiliza la plantilla del reporte consolidado de index.html y sus estilos de impresión: datos generales, situación, riesgo, plan, monitoreo, resumen y radar. El HTML se construye con el snapshot autorizado y se convierte a PDF mediante Chromium; no usa el generador de PDF antiguo. El PDF incorpora una imagen del mapa con marcador, coordenadas y atribución; espera a que cargue antes de imprimir y avisa si no puede obtenerla.

PDF y JSON usan el nombre original, por ejemplo PER-Hospital_dos_mayo.pdf y PER-Hospital_dos_mayo.json, también al imprimir. Drive usa esos nombres visibles; distingue las exportaciones por su identificador interno, de modo que conservar el nombre no sobrescribe mediciones o exportaciones anteriores. Un reintento del mismo trabajo conserva su correspondencia.

### Reenvío, visibilidad de claves y varios equipos

Enviar confirmación de correo queda deshabilitado mientras se procesa el envío. Después de una respuesta exitosa cambia a Reenviar confirmación de correo; si cambia el usuario o correo del formulario, vuelve al estado inicial. La plataforma se actualiza automáticamente y ya no muestra el botón Actualizar.

La contraseña personal nueva y su confirmación tienen botones independientes para mostrar y ocultar el contenido, tanto en el cambio obligatorio de clave temporal como en la ventana de Mi cuenta. Al cancelar, abrir de nuevo o guardar, ambos campos vuelven a ocultarse.

Una cuenta puede pertenecer a varios equipos. El administrador entra a Usuarios y permisos, completa el nombre y el mismo correo de la cuenta existente, elige Evaluador o Coordinador y el equipo adicional, y pulsa Crear cuenta / asignar acceso. La cuenta conserva identidad, usuario y contraseña; se añade la pertenencia al nuevo equipo. Los roles se definen por equipo. Retirar un acceso de un equipo no elimina los otros. No se necesitan cambios de esquema para esta función.

### Un único botón por participante

En Participantes y acceso, cada persona activa muestra Retirar de esta evaluación. Si está retirada, el mismo botón pasa a Agregar a la evaluación. Se eliminaron los botones generales Asignar / actualizar. Agregar requiere que la persona siga perteneciendo al equipo responsable; los participantes de equipos anteriores permanecen como historial. Las mediciones validadas y los permisos de consulta mantienen sus restricciones.

### Comprobación de los cinco pasos y colaboración

En Evaluaciones se ve el avance por establecimiento, los cinco pasos y los pendientes con enlaces Corregir al campo correspondiente. Finalizar evaluación vuelve a consultar el servidor: si faltan datos, los muestra; si está completa, conserva la versión histórica y cierra la medición. Pueden hacerlo el administrador autorizado o el coordinador participante. No exige una revisión técnica individual del administrador.

La comprobación incluye identificación, ubicación y población atendida total (un entero no negativo obligatorio), respuestas o justificaciones de los indicadores aplicables, problema/riesgos/gravedad/probabilidad de las brechas, acciones/recursos/responsable/plazo/presupuesto (0 si no requiere gasto), y fecha prevista de monitoreo. Los resultados futuros del monitoreo no bloquean el cierre. El plan y el monitoreo continúan en el establecimiento.

Los cambios en indicadores se sincronizan automáticamente. Si dos personas modifican campos distintos del mismo indicador, se conservan ambos cambios. Si modifican el mismo campo, prevalece el último guardado aceptado por el servidor. Los reintentos de un guardado no restauran versiones antiguas. La misma combinación por campo se aplica a datos generales, plan y monitoreo, con comprobación de permisos y estados. Sin conexión se conserva el borrador; al reconectar vuelve a sincronizarse.

El avance de cada paso se presenta como porcentaje; el 100 % se reserva para pasos completos. Ver campos pendientes abre los enlaces de corrección. En indicadores sin calificación, cualquier comentario no vacío permite completar la respuesta, igual en el navegador y en el servidor; no se exige una explicación adicional al texto «No aplica».

### Consulta y cachés anteriores del plan

Al consultar una evaluación sin permiso para editar una sección, sus datos se toman automáticamente de la nube. Los borradores locales anteriores de esa sección se conservan aparte en el almacenamiento del navegador y no se envían al servidor ni exigen resolver un conflicto. Esto también limpia conflictos pendientes de una caché antigua en modo de consulta.

Al reabrir una evaluación, el borrador se reconstruye con las filas de su propia caché. Un plan creado después por otra persona no genera un conflicto artificial con campos vacíos. Los conflictos vacíos anteriores se descartan cuando no contienen una edición real; los cambios reales concurrentes de un plan editable se sincronizan por campo, conservando los campos modificados por otras personas. La edición del plan y monitoreo autorizada por pertenencia al equipo continúa disponible aunque la medición esté en solo lectura.

### Sincronización automática de los cinco pasos

Coordinadores y evaluadores no resuelven avisos de versiones locales frente a la nube. Datos generales, indicadores, acciones del plan y borradores de monitoreo se combinan por campo: se envían únicamente los campos modificados respecto al borrador base. Los objetos internos, como los campos de monitoreo, se combinan también por campo. Las listas (fotos, integrantes e historial) son un campo completo. Para el mismo campo prevalece el último guardado aceptado por el servidor; campos distintos conservan ambos cambios, incluso si otro usuario guarda entre el refresco y el envío. Las diferencias antiguas pendientes se incorporan automáticamente al reconectar si siguen siendo editables. Los usuarios en consulta reciben la nube sin publicar borradores.

Los reintentos conservan su identificador de operación: si un guardado ya fue aceptado, confirmarlo otra vez no sobrescribe un guardado posterior ni descarta una edición nueva pendiente del usuario. Los permisos de edición y los registros de monitoreo en revisión o validados conservan sus bloqueos; la sincronización no modifica copias históricas.

Al reconectar una evaluación abierta, primero se confirma cualquier envío pendiente usando su identificador original y después se incorporan los campos remotos. Así, los datos recibidos nunca se vuelven a enviar como una edición propia. Vaciar texto, asignar cero o null y eliminar un campo son modificaciones explícitas; no se ignoran. Los formularios de acción y monitoreo de la plataforma guardan también únicamente sus campos modificados.

Los envíos pendientes de versiones anteriores se convierten a cambios por campo usando su base local. Si el servidor ya había aceptado la operación antigua, devuelve su confirmación original y conserva los guardados posteriores.


## Cerrar y volver a abrir sin internet

Abra primero la evaluación con conexión en el dispositivo y navegador que utilizará. La aplicación prepara sus archivos para uso sin conexión y conserva el borrador de esa cuenta y evaluación en IndexedDB. Cada edición se guarda localmente de inmediato; la franja superior informa **Sin conexión** y mantiene la fecha de la última sincronización confirmada.

Puede cerrar la aplicación y volver a abrirla sin internet. La plataforma muestra **Evaluaciones sin conexión** con las evaluaciones preparadas para esa cuenta; **Continuar sin conexión** recupera los datos y la sección utilizada, y permite seguir editando. No se consultan el establecimiento, el país ni la posición del servidor para recuperar el borrador. Los permisos locales desconocidos se consideran de solo lectura. La identidad local no incluye un token nuevo ni autoriza peticiones al servidor; tampoco exige renovar un token mientras no hay red.

Cuando vuelve internet, se renueva la sesión si corresponde, se vuelven a comprobar los permisos y se combinan automáticamente los cambios por campo. Campos distintos conservan ambas ediciones, y en el mismo campo prevalece el último guardado aceptado por el servidor. Si ya no hay permiso para editar, el borrador se conserva aparte y no se publica. Cerrar sesión impide volver a abrir el directorio offline de esa cuenta hasta ingresar otra vez con conexión.

Las evaluaciones que nunca se abrieron en ese dispositivo requieren conexión para prepararse. Borrar los datos del navegador o usar otro navegador no traslada el borrador local.


## Indicador de conexión y última sincronización

La plataforma y la evaluación muestran una franja persistente, adaptada a escritorio y móvil, con **Sin conexión**, **Sincronizando**, **Cambios pendientes**, **Sincronizado** o **Sin sincronizar** si hubo un error. Los estados incluyen texto además de color. La fecha y hora de **Última sincronización** se conserva en el dispositivo y se recupera al reabrir sin internet. Si aún no existe una sincronización confirmada, muestra **Aún no realizada**.

En la evaluación, la hora avanza al completar la lectura y combinación con el servidor sin cambios pendientes, o al confirmar todos los guardados pendientes. Guardar únicamente en el dispositivo, un envío cuya respuesta no llegó o una consulta fallida no adelantan esa hora. Un guardado sin cambios tampoco simula un contacto nuevo con el servidor. En la plataforma, corresponde a la última actualización completa de sus datos; la tabla offline muestra por separado la última sincronización de cada evaluación.

La franja no se imprime en los informes PDF y no sustituye la indicación **Solo lectura** ni el cumplimiento global.


## Finalizar evaluación y archivos compartidos

**Finalizar evaluación** comprueba los cinco pasos en el servidor. Si falta información, muestra los campos pendientes con enlaces para corregirlos. Si están completos, cierra la medición, conserva su versión histórica y permite continuar el monitoreo. El cierre no genera por sí mismo una descarga ni un archivo de Drive.

Las exportaciones e impresiones actualizan una misma pareja JSON/PDF por medición del establecimiento en el repositorio central, independientemente de la cuenta que exporte. La evaluación inicial conserva su nombre habitual; la reevaluación añade `_Reevaluación001`, `_Reevaluación002`, etc., sin sustituir la pareja de la evaluación inicial. Se conserva el nombre acordado y se reutilizan los identificadores de Drive; al cambiar el nombre del establecimiento se actualizan también esos mismos archivos. Las versiones históricas se conservan en la plataforma y pueden exportarse de nuevo.

Una reserva temporal compartida impide dos subidas simultáneas al mismo establecimiento. Se renueva mientras se transfieren los fragmentos; si se pierde la conexión, el reintento puede recuperar la sesión o reiniciarla usando los archivos existentes. Si hay otra exportación activa, se informa para reintentar. No se crean archivos si no puede comprobarse la copia anterior.

Después de verificar ambos archivos, se envían a la papelera las copias duplicadas anteriores identificadas por la app para ese mismo establecimiento. No se retiran archivos de otros establecimientos ni archivos sin esa identificación. La limpieza ocurre en la siguiente exportación correcta de cada establecimiento.

En la plataforma el estado confirmado dice **En línea · Información actualizada**: su hora corresponde a la última consulta completa de las listas. En la evaluación permanece **En línea · Sincronizado**, referido a los cambios de esa evaluación.


## Tabla unificada de evaluaciones

Todos los roles consultan **Establecimientos y evaluaciones**, con los establecimientos autorizados, incluidos los que faltan evaluar. El país, establecimiento y equipo acompañan siempre al inicio de una evaluación. En PC se muestran columnas; en móvil todos los campos de cada fila se presentan verticalmente.

Los estados visibles son **En curso** y **Validada**. En curso agrupa los estados internos antiguos de borrador, elaboración y revisión, sin alterar las versiones históricas. Un establecimiento sin medición muestra **Falta evaluar**. Las acciones se llaman **Continuar evaluación**, **Ver evaluación validada** y, para propietario/administrador, **Corregir versión anterior**. Coordinadores y evaluadores no pueden reabrir una versión validada. Los estados de registros independientes de monitoreo conservan su flujo específico.

Un error de red muestra un aviso legible, conserva la hora de la última consulta correcta y deja de mostrar información actualizada. La siguiente consulta automática que se completa correctamente elimina el aviso de red, sin borrar errores de validación de formularios. No se repiten operaciones de escritura automáticamente como parte de esa actualización de listas.

La revisión de esta lógica y el alcance de las comprobaciones se documentan en [AUDITORIA-APP.md](AUDITORIA-APP.md).


## Consultas optimizadas bajo carga

La lista de evaluaciones consulta porcentajes y cantidades de pendientes. Al desplegar **Ver campos pendientes** recupera los enlaces completos de esa evaluación. El historial consulta solo el establecimiento seleccionado y sus últimos 200 eventos; la lista no descarga todos los indicadores ni los historiales de cambios del país. Estas optimizaciones conservan la comprobación completa del servidor al finalizar. Las mediciones y los límites de la prueba se documentan en [PRUEBAS-DE-CARGA.md](PRUEBAS-DE-CARGA.md).

La medición posterior con usuarios ficticios sobre la infraestructura real verificó 20 evaluadores simultáneos y un administrador durante cinco minutos, con 100 establecimientos registrados. Como margen inicial se recomienda planificar 15 evaluadores activos. Las condiciones, los tiempos de espera observados con 25 y los límites se detallan en [CAPACIDAD-PRODUCCION.md](CAPACIDAD-PRODUCCION.md). El resumen se calcula por lotes sin construir enlaces que la lista no utiliza; la comprobación completa al finalizar se conserva.
