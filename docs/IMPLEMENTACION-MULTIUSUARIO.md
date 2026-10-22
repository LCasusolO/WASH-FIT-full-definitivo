# Activación de WASH FIT con países, equipos y monitoreo continuo

## Estado de esta entrega

El código incorpora el espacio de trabajo `plataforma.html`, cuentas Supabase,
permisos por país/equipo/evaluación, edición por registro, conflictos explícitos,
plan vigente, monitoreo del paso 5, versiones validadas y reportes autenticados.

El proyecto Supabase **WASH FIT Definitivo** ya fue creado e instalado el
22 de octubre de 2026: `wkchpmqeeyoqupuilrqh`, región `us-east-1`, organización
LCasusolO. Panel: https://supabase.com/dashboard/project/wkchpmqeeyoqupuilrqh.
La activación aún requiere configurar Auth, correo y Vercel. La variable
`WASH_MULTIUSER` mantiene el modo actual mientras no se complete la instalación.

Las pruebas de base de datos utilizan PostgreSQL embebido (PGlite) con usuarios
ficticios. El servidor de QA de interfaz simula exclusivamente el transporte de
Supabase Auth/REST; ejecuta las mismas migraciones y permisos de PostgreSQL. No
sustituye la comprobación final de correo, Storage, Realtime y Drive con el
proyecto real. No conectar el servidor de QA a producción.

## 1. Conservar los datos actuales

1. Descargar el JSON de cada evaluación que se quiera conservar.
2. Conservar también los PDF existentes y los archivos de Drive.
3. No borrar los datos del sitio en el navegador: el borrador anterior puede
   importarse desde el nuevo espacio de trabajo.

El primer inicio de sesión no asigna automáticamente un borrador a un país o
persona. La importación requiere seleccionar su establecimiento y equipo.

## 2. Proyecto Supabase

Para esta instalación ya existe el proyecto indicado arriba. No crear otro.
Su URL es `https://wkchpmqeeyoqupuilrqh.supabase.co`. Las instrucciones de
creación siguientes se conservan para una instalación nueva.

En https://supabase.com/dashboard crea un proyecto para WASH FIT. Elige región,
responsable de la organización y plan según las necesidades de operación.
Introduce la contraseña de la base de datos directamente en Supabase; no la
incluyas en GitHub ni en el navegador de WASH FIT.

En Settings / API Keys copia:

- URL del proyecto: `https://TU-PROYECTO.supabase.co`.
- Clave **publishable**, que comienza por `sb_publishable_`.

Esta versión no necesita una clave `service_role` ni `sb_secret_`. No las uses
en sustitución de la publishable. Las peticiones actúan con la sesión del usuario
y las políticas de PostgreSQL, no con privilegios administrativos globales.

## 3. Instalar la base de datos y el depósito privado

En el proyecto indicado ya están aplicadas las tres migraciones. **No volver
a ejecutarlas allí.** Para una base nueva, ejecutar los archivos completos,
en este orden, una sola vez:

1. `supabase/migrations/202610220001_platform.sql`.
2. `supabase/migrations/202610220002_evidence.sql`.
3. `supabase/migrations/20261022222234_wash_fit_security_and_indexes.sql`.

El primero crea tablas `wash_*`, políticas RLS, funciones transaccionales y la
publicación de cambios en las tablas necesarias. El segundo crea el bucket
privado `wash-evidence`, con imágenes JPEG/PNG/WebP de hasta 5 MB. El tercero
mueve la implementación privilegiada de escritura al esquema privado y añade
índices y ajustes de políticas. El RPC público conserva el mismo contrato.

Las versiones del historial remoto son `20261022222114`, `20261022222115`
y `20261022222322`; Supabase asignó esos identificadores al aplicar las
migraciones mediante el conector. No se ha enlazado el CLI ni reconciliado su
historial con los nombres locales. No ejecutar `db push` sin revisar esa
correspondencia.

Las migraciones son de instalación inicial, no scripts para ejecutar repetidas
veces sobre una base ya instalada. Si una transacción falla, revisar el error
antes de continuar. No desactivar RLS para resolverlo.

Verificar en Supabase:

- Todas las tablas `wash_*` tienen RLS activado.
- El bucket `wash-evidence` no es público.
- Realtime publica `wash_records`, `wash_evaluations` y las tablas de membresía.
- La aplicación no puede escribir directamente en las tablas: usa `wash_command`.

## 4. Configurar acceso por correo

En Authentication:

1. Habilitar correo y contraseña.
2. Mantener activada la confirmación de correo.
3. Configurar longitud mínima de contraseña de 12 caracteres.
4. Configurar SMTP propio y un remitente autorizado para producción.
5. Establecer Site URL: `https://washfit-full.vercel.app`.
6. Agregar Redirect URL: `https://washfit-full.vercel.app/plataforma.html`.
7. Durante la revisión, agregar también la URL exacta del despliegue Preview
   terminada en `/plataforma.html`.

El SMTP predeterminado de Supabase tiene restricciones de destinatarios y no
está destinado a producción. Configura un servicio SMTP antes de invitar a
usuarios externos. Referencia: https://supabase.com/docs/guides/auth/auth-smtp.

Las invitaciones de permisos de WASH FIT se comparten por enlace. Los correos de
confirmación y recuperación los envía Supabase mediante ese SMTP. Crear una
cuenta no concede acceso: el usuario debe aceptar una invitación de ámbito.

## 5. Variables de Vercel

En el proyecto correcto **washfit-full**, configurar:

| Variable | Valor |
|---|---|
| `SUPABASE_URL` | URL del proyecto, sin barra final. |
| `SUPABASE_PUBLISHABLE_KEY` | Clave pública `sb_publishable_...`. |
| `WASH_MULTIUSER` | `true` para activar; `false` conserva el modo local. |
| `WASH_APP_ORIGIN` | `https://washfit-full.vercel.app`, sin barra final. |

Conservar las cuatro variables privadas de Google que ya utiliza el proyecto:
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` y
`GOOGLE_DRIVE_FOLDER_ID`. No modificar el OAuth de Drive para autenticar a los
usuarios: son conexiones independientes.

Preparar primero un despliegue Preview de la rama con estas variables. En Preview,
`WASH_APP_ORIGIN` debe coincidir exactamente con su origen, sin ruta ni barra final.
No utilizar credenciales de un proyecto Supabase con datos reales para el servidor
local de QA incluido en tests.

Las variables nuevas se aplican al crear un nuevo despliegue. No basta con
guardarlas en el panel. La configuración pública se sirve desde
`/api/platform-config`; ninguna clave de Google se devuelve en ese endpoint.

## 6. Crear el primer propietario

1. Abrir `/plataforma.html` en el despliegue configurado.
2. Crear tu cuenta y confirmar el correo.
3. En SQL Editor, abrir `supabase/crear-propietario.sql`.
4. Reemplazar `REEMPLAZAR_POR_TU_CORREO` por el correo de esa cuenta verificada.
5. Ejecutar y volver a iniciar sesión o pulsar Actualizar en el aplicativo.

También puede crearse la cuenta verificada desde Authentication / Users por el
administrador del proyecto Supabase y después ejecutar el mismo script.

Cada representante de OPS utiliza una cuenta individual. Si posteriormente se
designa otro propietario autorizado, repetir el script con su cuenta. El
propietario puede administrar la plataforma; para editar mediciones debe además
pertenecer al equipo y estar asignado a la evaluación.

## 7. Configuración inicial de un país

Desde **País y equipos**, el propietario:

1. Registra el país con su código de tres letras, por ejemplo `PER`.
2. Selecciona el país.
3. En Invitar, elige ámbito País y rol Administrador del país.
4. Copia el enlace y lo comparte con la persona correspondiente.

El destinatario crea y verifica su cuenta, abre el enlace y pulsa Aceptar.
La invitación dura siete días, requiere el mismo correo y solo se utiliza una vez.
El administrador crea establecimientos y equipos; después invita al coordinador
con rol Coordinador responsable y a los integrantes como Evaluador o Lector.

Para trabajar tú mismo como coordinador, puedes invitar tu propia cuenta al equipo
y aceptar la invitación. No necesitas crear otra cuenta ni compartir contraseñas.

Finalmente, seleccionar el establecimiento y equipo y pulsar **Asignar equipo al
establecimiento**. Debe existir un coordinador antes de crear la primera evaluación.

La interfaz de evaluación conserva el catálogo de países de las Américas que ya
tenía WASH FIT. No registrar códigos ajenos a ese catálogo para editar evaluaciones.

## 8. Evaluar, mejorar y monitorear

### Evaluación integral

El coordinador crea la evaluación inicial. Sus integrantes se copian como
participantes con acceso. Se abre el editor existente para datos generales,
indicadores y riesgos. El país y el nombre del establecimiento se toman del
registro administrativo.

El guardado se divide en indicadores y bloques de datos generales: identificación,
población, coordenadas, equipo, fotografías y resumen. Dos personas pueden
guardar registros distintos. Si modifican el mismo registro, se muestra un
conflicto; nadie sobrescribe automáticamente la versión ajena.

En el editor, los accesos a los pasos 4 y 5 abren el plan vigente y el monitoreo del
establecimiento. Las reglas actuales de puntuación, visibilidad y JMP se conservan.

### Plan de mejora

Agregar acciones con indicador, responsable, recursos, costo, plazo y estado.
Las acciones continúan activas después de validar una medición. Para modificar
una acción, indicar el motivo. Un ajuste puede vincularse al monitoreo validado
que lo motivó. El historial conserva cada versión.

### Monitoreo del paso 5

Crear un registro con fecha, equipo responsable, participantes, hallazgos, medidas
correctivas, próxima revisión y elementos revisados. Puede incluir fotografías.
Guardar borrador, enviar a revisión y validar mediante el coordinador de ese equipo.

El monitoreo registra cambios observados; **no reemplaza las puntuaciones de la
medición inicial**. Un monitoreo validado queda bloqueado. Para documentar nuevos
hallazgos, crear otro registro fechado.

### Validación y correcciones

La medición pasa de Borrador/En elaboración a En revisión y después a Validada.
El coordinador puede devolverla para correcciones. Validar conserva una copia
inmutable de la medición, participantes y plan a esa fecha; no termina el trabajo
del establecimiento ni bloquea el paso 5.

La validación es una decisión del coordinador. No inventa respuestas ni certifica
que se haya alcanzado el 100 % de cobertura. Revisar los indicadores pendientes
y la cobertura antes de validar.

Si una medición validada contiene un error, el coordinador o administrador puede
iniciar una corrección con motivo de al menos diez caracteres. La versión validada
anterior permanece en Historial. Volver a revisar y validar después de corregir.
No se permite reabrir otra medición mientras ya exista una en elaboración.

### Reevaluación integral

Crear una nueva medición, seleccionar una evaluación validada de referencia y
realizar nuevamente la evaluación. Comienza sin puntuaciones copiadas. El plan
y los monitoreos anteriores permanecen en el establecimiento.

Historial permite exportar versiones validadas anteriores y comparar indicadores
entre dos versiones del mismo establecimiento. Si cambia el catálogo se bloquea
la comparación automática. Un indicador fuera del alcance o sin puntuación en
alguna medición aparece sin comparación directa; no se mezclan denominadores.

## 9. Personas, permisos y cambios de equipo

La lista administrativa del equipo define quién puede recibir nuevas asignaciones.
La lista de participantes controla el acceso a cada evaluación. Agregar una persona
al equipo no le concede automáticamente todas las evaluaciones históricas:
el coordinador utiliza Participantes y acceso en cada evaluación activa. Para cambiar el equipo responsable completo, el administrador nacional utiliza Transferir equipo responsable y selecciona otro equipo previamente asignado al establecimiento. La transferencia conserva las versiones históricas y revoca el acceso anterior a esa evaluación.

Retirar a alguien del equipo revoca sus accesos de evaluación, conservando nombres
y autoría histórica. Debe quedar un coordinador en el equipo y en cada evaluación
activa. Primero asignar al reemplazo y luego retirar al anterior.

Los lectores no pueden editar aunque llamen directamente a la API. Los
administradores nacionales no editan respuestas si no participan también en el
equipo evaluador. Toda elevación de permisos vuelve a comprobarse en PostgreSQL.

## 10. Importar información anterior

En Evaluaciones, seleccionar equipo y periodo y utilizar Importar evaluación
existente. Se admiten los JSON anteriores del aplicativo y los respaldos de una
medición integral exportados por la plataforma. Los expedientes de plan y monitoreo también pueden importarse: incorporan sus acciones y los monitoreos quedan como borradores sin validación, asignados al equipo seleccionado.

También puede importarse el borrador local del mismo navegador y dominio donde
se utilizó la versión anterior. Cambiar a una URL Preview no transfiere el
IndexedDB del dominio de producción: usar el JSON en ese caso.

Las acciones se incorporan al plan. Los comentarios e historiales de monitoreo
antiguos se conservan como antecedentes importados sin inventar fecha, autoría o
validación. Los archivos originales y el borrador local no se borran.

Si una importación se interrumpe, reintentar con el mismo archivo, cuenta,
establecimiento y formulario en la misma sesión del navegador. Las operaciones
confirmadas se reconocen y no se duplican.

## 11. Reportes y Drive

Exportar descarga un JSON y un PDF y después intenta archivarlos en Drive.
Configurar el navegador para permitir ambas descargas si lo solicita.

La medición validada exporta su versión del plan a la fecha de validación. El
expediente del establecimiento exporta el plan vigente y sus monitoreos. Cada
exportación tiene UUID propio; dos evaluaciones del mismo establecimiento no
actualizan los mismos archivos por coincidencia de nombre.

Si Drive falla después de generar los archivos, el botón Reintentar archivado pendiente recupera el trabajo en ese navegador sin volver a descargar los archivos.

La autorización de una evaluación no concede permisos directos sobre la carpeta
central de Drive. Los usuarios descargan desde la aplicación. El acceso mediante
enlaces de Drive depende de la configuración de esa carpeta.

Los reportes colaborativos utilizan una plantilla tabular del servidor e incluyen
la identificación de exportación. Los reportes del modo local conservan su
plantilla anterior. Hay límites de tamaño de respuesta y PDF del alojamiento;
se informa un error si las fotografías hacen superar esos límites.

## 12. Comprobación antes de producción

En el despliegue conectado al proyecto real:

1. Confirmar alta, verificación, inicio de sesión y recuperación por correo.
2. Utilizar dos cuentas autorizadas y una tercera sin acceso.
3. Confirmar que la tercera no ve establecimientos privados.
4. Editar indicadores distintos desde dos navegadores y comprobar Realtime.
5. Modificar el mismo registro y comprobar que se requiere resolver el conflicto.
6. Cerrar/reabrir el navegador y recuperar el trabajo.
7. Comprobar una fotografía privada y su inclusión en el PDF.
8. Validar una medición y registrar después un monitoreo del paso 5.
9. Confirmar que la medición original y su puntuación no cambian.
10. Confirmar JSON y PDF en Drive con archivos independientes.
11. Retirar un usuario y comprobar que ya no puede consultar ni guardar.

Después de estas comprobaciones, integrar la rama en `main`, establecer las
variables en Production y generar un nuevo despliegue. Mantener el OAuth de
Google en producción; no hay que volverlo a modo Testing.

## 13. Desarrollo y mantenimiento

```powershell
npm ci --ignore-scripts
npm test
npm run build
node --env-file=.env scripts/serve.cjs
```

Para renderizar PDF localmente en Windows, definir `WASH_CHROME_EXECUTABLE` como
la ruta a Chrome. Para revisar solo la interfaz con datos ficticios:

```powershell
npm run build
node tests/support/platform-fixture.cjs
```

El servidor aislado abre puertos 59439 y 59440, con la misma base efímera y dos
orígenes para probar sesiones diferentes. Cuentas `coordinator@example.invalid`
y `editor@example.invalid`, contraseña ficticia `Fixture-password-123`.
No envía correos ni se conecta a Google Drive. Finalizar con Ctrl+C.

Configurar respaldos de PostgreSQL y de Storage según el plan contratado.
Drive no contiene por sí solo toda la estructura de países, permisos e invitaciones.
La eliminación física y retención de expedientes se administran en el servidor;
esta versión no incorpora borrado definitivo autoservicio.

Si se desactiva `WASH_MULTIUSER`, los datos en Supabase no se borran, pero se
vuelve al modo local anterior y sus API de archivo dejan de exigir cuentas.
No utilizar esa opción como mecanismo de seguridad ni como cierre de accesos.

Referencias oficiales:

- https://supabase.com/docs/guides/getting-started/quickstarts/vue
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/realtime/postgres-changes
- https://supabase.com/docs/guides/storage/security/access-control
- https://supabase.com/docs/guides/auth/redirect-urls
