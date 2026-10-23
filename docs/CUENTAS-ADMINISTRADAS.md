# Cuentas administradas de WASH FIT

## Uso en producción

El registro público y las invitaciones de acceso anteriores se sustituyen por creación directa de cuentas. La recuperación de contraseña no crea cuentas ni asigna permisos.

### Propietario

La cuenta propietaria existente conserva correo y contraseña y recibe el usuario `propietario`. Puede seguir ingresando con su correo.

1. Abrir `plataforma.html` e ingresar.
2. Seleccionar país y entrar a **Usuarios y permisos**.
3. Completar nombre, correo y usuario; el botón **Generar usuario** propone uno editable.
4. Seleccionar ámbito País y rol Administrador del país.
5. Crear la cuenta y copiar la contraseña temporal mostrada en pantalla. Comunicar las credenciales personalmente por un medio privado. No se envían contraseñas por correo.

Para crear integrantes directamente, seleccionar el ámbito Equipo y su rol.

### Administrador nacional

Puede registrar coordinadores, evaluadores y lectores para los equipos de sus países. No puede nombrar administradores nacionales ni modificar accesos de otros países. El directorio solo muestra las personas y asignaciones de su ámbito.

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

No hay eliminación física de cuentas desde el aplicativo: se conserva la autoría y se utilizan suspensión y retiro de permisos.

## Infraestructura

- Migración: `supabase/migrations/20261022235838_managed_accounts.sql`.
- Edge Function: `supabase/functions/wash-accounts/index.ts` y `handler.mjs`.
- Publicar como `wash-accounts`, con `verify_jwt=false`: el ingreso y recuperación son públicos; todas las operaciones administrativas verifican el JWT con Auth y el estado de la sesión en SQL.
- La función usa las variables internas `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`. No copiar la clave administrativa a Vercel ni al navegador.
- Vercel usa las variables existentes y `/api/accounts` como proxy del mismo origen. No cambia el OAuth de Google Drive.
- Desactivar **Allow new users to sign up** en Supabase. Además, un trigger impide nuevas cuentas que no estén marcadas por Auth Admin como administradas. El SDK público no puede establecer `raw_app_meta_data`.
- El cambio de contraseña consulta el estado actual y las sesiones de Auth; las políticas RLS y Storage comprueban esos mismos requisitos.

La migración conserva las cuentas existentes, asigna usuarios únicos y mantiene el acceso previo. Revoca invitaciones pendientes y deshabilita las operaciones antiguas de invitación. Para una instalación completamente nueva, el primer propietario requiere un alta de bootstrap mediante Auth Admin con `app_metadata.wash_managed=true`, confirmación del correo, activación del perfil y `supabase/crear-propietario.sql`. No se debe habilitar el registro público para ese fin.

## Pruebas

Las pruebas de cuentas utilizan el mismo SQL y handler de producción con PostgreSQL/RLS embebido y un adaptador ficticio de Auth. Se comprueban altas, reintentos sin volver a mostrar contraseñas, confirmación, cambio obligatorio, directorio, ámbitos, recuperación sin registro, sesiones antiguas, suspensión, último responsable y conservación de snapshots al cambiar roles. El contrato histórico de invitaciones se prueba por separado contra las migraciones previas.

`node tests/support/managed-fixture.cjs` sirve QA aislado en `127.0.0.1:59441`. Usa `propietario` / `Fixture-password-123`; no conectar ese servidor a Supabase ni a Drive reales. La confirmación de correo es simulada en ese entorno.

## Comprobación de la infraestructura

La migración se aplicó al proyecto WASH FIT Definitivo y la Edge Function quedó activa. Se conservaron las dos cuentas existentes y el propietario activo. Se verificó por HTTP que el registro público devuelve `Signups not allowed for this instance`, que listar cuentas sin sesión devuelve 401 y que un usuario inexistente no puede ingresar. El RPC administrativo no es ejecutable por `anon` ni `authenticated`.

Los asesores no indican errores de RLS ni funciones administrativas públicas. Supabase advierte que la protección contra contraseñas filtradas está desactivada; el panel la ofrece en planes Pro o superiores. Se mantuvo el plan actual. Los avisos informativos de catálogo privado e índices sin uso corresponden a la configuración existente y a tablas nuevas.
