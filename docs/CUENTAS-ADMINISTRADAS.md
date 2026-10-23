# Cuentas administradas de WASH FIT

## Uso en producción

El registro público y las invitaciones de acceso anteriores se sustituyen por creación directa de cuentas. La recuperación de contraseña no crea cuentas ni asigna permisos.

### Propietario

La cuenta propietaria existente conserva correo y contraseña y recibe el usuario `propietario`. Puede seguir ingresando con su correo.

1. Abrir `plataforma.html` e ingresar.
2. Registrar el país en **País y equipos** y entrar a **Usuarios y permisos**.
3. Completar nombre completo y correo.
4. Seleccionar el rol Administrador del país y el país. No requiere un equipo. El usuario se genera automáticamente al final, por ejemplo `admin-peru`.
5. Crear la cuenta y copiar la contraseña temporal mostrada en pantalla. Comunicar las credenciales personalmente por un medio privado. No se envían contraseñas por correo.

El alta global se limita a países y administradores nacionales. Los establecimientos, equipos y cuentas de integrantes los registra el administrador de cada país.

El rol Lector se retiró de formularios y operaciones administrativas. Las asignaciones antiguas de lectura se revocan sin transformarlas en permisos de edición. Los registros históricos se conservan.

### Administrador nacional

Puede registrar coordinadores y evaluadores para los equipos de sus países. No puede nombrar administradores nacionales ni modificar accesos de otros países. El directorio solo muestra las personas y asignaciones de su ámbito.

Para crear integrantes, completar nombre y correo, elegir Coordinador responsable o Evaluador, seleccionar país y equipo, y revisar el usuario generado al final. Ejemplos: `coordinador-maria-nunez` y `evaluador-luis-casusol`. Si hay coincidencias, el servidor añade un número (`-2`, `-3`, etc.). El nombre de usuario no se escribe manualmente en el alta. Las cuentas existentes conservan su usuario al recibir otro acceso.

### Vista por rol

El administrador nacional registra establecimientos, crea equipos y los asigna a establecimientos desde **País y equipos**. El coordinador y el evaluador consultan allí únicamente una tabla de integrantes de sus propios equipos.

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

En la evaluación, el estado de consulta muestra **Solo lectura**. Los errores y conflictos de sincronización siguen mostrando sus avisos. El cumplimiento y el estado se distribuyen sin comprimir las etiquetas en móvil y escritorio.

### Administración y navegación de integrantes

La sección Establecimientos y equipos del administrador ya no muestra la tarjeta ni el selector de país administrado; usa automáticamente el país asignado. **Administrar integrantes** abre Usuarios y permisos desde su inicio y deja seleccionado el equipo de la fila para crear o asignar cuentas.

El formato nuevo de reevaluación continúa la numeración de nombres anteriores como Reeval-001. Las mediciones históricas y sus snapshots conservan su nombre; los reintentos de operaciones anteriores siguen devolviendo el resultado original.

### Organización por rol

Para la administración global, la sección se llama **País y establecimientos**. Países y administradores incluye el total de establecimientos de cada país y permite desplegar su lista. Para administradores, coordinadores y evaluadores se llama **Establecimientos y equipos**. La tabla reúne equipos asignados, transferencia del equipo responsable y participantes de cada medición. Solo los roles autorizados reciben controles de modificación; las mediciones validadas conservan sus participantes históricos. En Evaluaciones queda un único enlace para continuar cada medición abierta.
