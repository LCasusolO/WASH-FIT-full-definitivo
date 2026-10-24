# Sincronización incremental y capacidad observada

Fecha: 23 de octubre de 2026, Lima (24 de octubre UTC). Pruebas autorizadas sobre la infraestructura actual, con datos ficticios separados por identificadores y metadatos de prueba.

## Cambios

1. El editor conserva la versión conocida de cada registro. `wash_editor_sync` devuelve solo registros cambiados y los identificadores retirados, junto con el contexto de permisos. Comparar versiones evita depender del reloj del dispositivo o de una marca temporal que pueda omitir una transacción concurrente. Los registros generales e indicadores pertenecen a la evaluación abierta; acciones y monitoreo conservan su alcance compartido por establecimiento.
2. Realtime es la vía principal. Una notificación autorizada con la fila completa actualiza la caché sin volver a descargarla. Las versiones antiguas se descartan. La mezcla por campo conserva las ediciones locales pendientes. Eventos recibidos durante una lectura o hidratación quedan pendientes hasta aplicarse. Al reconectar se comprueba el delta; si faltan eventos, hay error, trabajo pendiente o cambia el foco, se recupera desde el servidor. El pulso local de cinco segundos no implica una petición: el respaldo de lectura es de 30 segundos en actividad sin eventos recientes, hasta 120 segundos con flujo saludable o inactividad, y 15 segundos sin suscripción. Los errores y envíos pendientes se reintentan antes.
3. El panel agrupa los establecimientos afectados durante 500 ms y consulta solo sus evaluaciones y avances. `wash_progress_sync` compara huellas de identidades/versiones y participantes; la consulta de respaldo no vuelve a calcular los porcentajes sin cambios. Conserva los demás resultados en memoria. Los listados completos se comprueban cada 60 segundos en actividad o 120 segundos en reposo; sin Realtime, cada 15 segundos. No se superponen cargas completas con actualizaciones parciales.

La prueba encontró además que el panel de evaluaciones solicitaba el directorio de usuarios y el historial de administración en segundo plano. Ahora se consultan al abrir **Usuarios y permisos**, después de una modificación o durante la actualización de esa sección mientras está visible. El contador de usuarios se muestra cuando se conoce el dato.

## Conservación de datos y permisos

No se cambiaron las funciones de escritura ni la regla de conflictos. El servidor sigue aplicando exclusivamente `field_changes`; campos diferentes se combinan y, para el mismo campo, prevalece la última escritura aceptada por el servidor. La hora local no decide el resultado. Los reintentos conservan el identificador de operación y no deshacen un cambio posterior.

IndexedDB conserva el borrador, la base y la operación pendiente. La recuperación offline y las fotos se mantienen; una versión de foto sin cambios no se vuelve a hidratar en cada lectura. Los nuevos puntos de entrada públicos usan `SECURITY INVOKER`, exigen una cuenta autorizada y sus funciones privadas verifican acceso antes de leer. Las pruebas incluyen cuentas sin permiso y acceso anónimo denegado. No se ampliaron permisos ni los límites de espera del servidor.

## Carga real

Se prepararon 100 establecimientos, 20 equipos, 202 cuentas confirmadas ficticias y 10.300 registros. Se usaron 25, 35 o 50 sesiones distintas de evaluador y un administrador con el panel activo. Los evaluadores escriben en los primeros 20 establecimientos; varios comparten evaluación y alternan indicador, acción y monitoreo, incluyendo campos anidados y colisiones en el mismo campo. Cada evaluador espera cinco segundos entre un guardado confirmado y el siguiente. Las oleadas comienzan dentro de 720 ms; no se repartieron artificialmente a lo largo de cinco segundos.

Cada etapa final tiene 180 segundos de actividad, más inicio de sesión, suscripción, drenaje y comprobación. Auth, RLS, RPC, Realtime y base de datos son los de producción. El generador usa clientes Node sobre internet, con el protocolo del editor y panel; no son 50 navegadores completos. El límite de espera de 20 segundos pertenece al generador. Se contabilizan los intentos fallidos aunque el reintento tenga éxito.

| Evaluadores + administrador | Guardados confirmados | Peticiones fallidas | P95 de guardado | Máximo de guardado | Campos servidor / comprobaciones en clientes | Diferencias |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 25 + 1 | 853 | 0 | 1,11 s | 3,92 s | 86 / 117 | 0 |
| 35 + 1 | 1085 | 0 | 5,33 s | 10,62 s | 113 / 208 | 0 |
| 50 + 1 | 1700 | 0 | 0,44 s | 5,55 s | 153 / 396 | 0 |

Las tres etapas cerraron sin errores, sin fallos de suscripción ni desconexiones Realtime y sin diferencias en la comprobación final de servidor y clientes. Se efectuaron además 12 retransmisiones deliberadas con el mismo identificador: devolvieron su resultado original. El P95 de lectura incremental fue 0,63 s, 6,15 s y 0,35 s respectivamente; el de avance del panel fue 1,25 s, 0,78 s y 0,74 s.

**La latencia no fue uniforme:** 35 usuarios superaron el objetivo de comodidad de dos segundos de guardado aunque no hubo errores ni pérdida de datos; 50 respondieron más rápido en su ventana. Son ejecuciones sucesivas en infraestructura compartida, no una curva de capacidad determinista. La prueba verifica que 50 funcionaron bajo este escenario durante tres minutos, sin garantizar ese tiempo de respuesta en toda circunstancia.

Con 50 evaluadores hubo 200 consultas delta del editor y 5173 filas recibidas por esa vía, incluyendo 5150 filas de la carga inicial. Realtime entregó 4420 notificaciones y el panel recalculó 784 resúmenes a lo largo de 44 peticiones de progreso; no recalculó las 100 evaluaciones en cada notificación.

Evidencia: `incremental-carga-25-35-final.json` y `incremental-carga-50-rafaga.json`. La primera contiene las dos repeticiones menores con el mismo respaldo de lectura de la versión final; la segunda, la etapa de 50.

### Incidencias durante la afinación

La primera variante aún consultaba usuarios/historial fuera de su sección y produjo tiempos de espera. Tras retirar esas consultas, una etapa de 35 evaluadores todavía tuvo **63 peticiones fallidas**, incluidas tres cancelaciones SQL por límite de ejecución; las demás fueron tiempos de espera del cliente. No hubo diferencias en los 113 campos contrastados en servidor ni en las 208 comprobaciones de clientes. La lectura periódica seguía compitiendo con un flujo Realtime activo. Se aplazó ese respaldo mientras llegaban eventos, manteniendo la comprobación máxima de contexto a los 120 segundos, la recuperación de eventos perdidos y el reintento de pendientes.

Estos resultados fallidos se conservan en la evidencia; no se presentan como pruebas aprobadas. Los tiempos HTTP incluyeron esperas mucho mayores que el tiempo de ejecución SQL observado. No se atribuye toda la demora a una causa de infraestructura sin medición suficiente ni se cambió el plan Free.

## Límites

El nivel observado no es un máximo universal ni una garantía durante horas o días. Las mediciones no incluyen exportación simultánea de PDF/Drive, fotos masivas, altas masivas ni rendimiento del teléfono Android físico. La conexión, el tamaño de datos y los recursos compartidos pueden cambiar. Las 60 conexiones PostgreSQL configuradas no equivalen a 60 evaluadores.

El generador reproducible es `scripts/load-incremental.cjs`; requiere autorización explícita mediante variable de entorno y un manifiesto privado marcado. La evidencia anterior a estos cambios queda en [CAPACIDAD-PRODUCCION.md](CAPACIDAD-PRODUCCION.md).

## Regresión, navegador y limpieza

**215 pruebas de regresión aprobadas y compilación correcta.** Incluyen SQL real embebido con RLS y roles, eventos de versiones antiguas, eventos durante hidratación, respaldo de notificaciones perdidas, borrados, aislamiento de cuentas y conservación de los porcentajes sin cambios.

Se abrió el frontend compilado en Chrome, servido en loopback y conectado al backend real con dos cuentas ficticias autorizadas sobre un establecimiento de prueba fuera del grupo de carga. Se comprobó la recepción automática de una edición entre PC y viewport móvil de 390 px, el cierre completo de ambos navegadores sin internet, su reapertura offline con el borrador conservado y la combinación automática al reconectar. El campo cambiado por la otra cuenta permaneció intacto; el último guardado en el mismo campo apareció en ambos clientes y servidor. Es emulación móvil en Chrome, no una prueba sobre un Android físico. Evidencia: `incremental-browser-qa.json`.

La reconciliación final contrastó **7663 modificaciones aceptadas de campo** de todas las etapas y del navegador, incluidas operaciones cuyos acuses habían fallado durante la afinación, con sus **156 campos resultantes: cero diferencias**. Para cada campo se tomó la mayor versión aceptada del servidor. Evidencia: `incremental-reconciliacion-servidor.json`.

Se eliminaron las 202 cuentas ficticias y sus sesiones, los 100 establecimientos y sus evaluaciones, 20 equipos, registros y operaciones de prueba. Las **17 tablas públicas coinciden exactamente en conteos y hashes** con la huella previa. Quedaron cero cuentas con el marcador de esta ejecución y cero países ficticios QXI. No se modificaron los datos reales ni se exportaron informes al Drive real. Las secuencias y los logs internos pueden reflejar que hubo pruebas; no se manipularon para ocultarlas. Evidencia: `incremental-originales-antes.json` e `incremental-originales-despues.json`.

Se retiraron también el manifiesto con contraseña temporal, las sesiones guardadas, el SQL de siembra con contraseña y los dos perfiles aislados del navegador. No se incluyen credenciales en Git ni en los resultados.

Migraciones aplicadas: `20261024025117_incremental_editor_sync` y `20261024025944_deterministic_editor_context`.
