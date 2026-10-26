# Memoria y escenario de 100 establecimientos con cuatro integrantes

Revisión del 25 de octubre de 2026 (hora de Lima). El escenario objetivo es 100 establecimientos, 100 equipos y cuatro integrantes por equipo: 400 personas simultáneas. No se ha certificado esa concurrencia en producción.

## Qué está comprobado

El proyecto usa Free / Nano, `t4g.nano`, con hasta 0.5 GB de RAM. La consola muestra 1.49 GB de memoria comprometida y la alerta SEVERE; la gráfica también muestra swap sostenido mientras no se ejecutaba carga. Memoria comprometida (`Committed_AS`) representa asignaciones prometidas, incluidas páginas todavía no residentes; no equivale a RAM física consumida. La documentación explica que conexiones y operaciones de ordenación/hash pueden elevarla antes de que la RAM física se agote: https://supabase.com/docs/guides/observability/reports#memory-commitment.

La captura SQL tenía siete conexiones, sin consultas ajenas activas ni transacciones largas o bloqueadas. `shared_buffers` es 224 MiB y `work_mem` aproximadamente 2.13 MiB por operación. La alerta no demuestra una fuga de memoria del navegador ni que haya 400 conexiones directas a Postgres. Los clientes usan PostgREST; las conexiones HTTP, Realtime y Postgres son métricas distintas.

No se encontró un evento OOM en los logs consultados del corte de 19:09 UTC del 24 de octubre. El registro posterior de cierre de Realtime indica que no quedaban usuarios, no un fallo OOM. La falta de un registro no descarta presión de memoria y tampoco permite declarar probada la causa única de los 522.

Las estadísticas acumuladas sí identifican trabajo costoso:

- `wash_evaluation_progress`: 226 llamadas y 84 812 bloques temporales escritos, aproximadamente 663 MiB acumulados. Es volumen histórico de escritura temporal, no memoria actualmente ocupada.
- `realtime.list_changes`: 178 914 llamadas, aproximadamente 3.97 millones de ms acumulados y una llamada máxima de 14.43 segundos. No es una medición de 400 usuarios.
- La mayor parte del tamaño de datos de las pruebas estaba en eventos y operaciones de auditoría/idempotencia, no en las evaluaciones actuales. Esos registros no se eliminaron indiscriminadamente.

## Correcciones implementadas y estado de publicación

La migración `20261026011945_bound_progress_memory.sql` limita el cálculo de avance a diez evaluaciones por lote dentro del servidor. Protege también a clientes anteriores que solicitan todo un país. El cálculo de cada lote conserva los predicados de cuenta y lectura originales; el auxiliar no se concede directamente a clientes. Se conserva el resultado completo y no se publican resúmenes parciales.

La comparación aislada sobre cien establecimientos ficticios del backend existente produjo:

| Método | Tiempo | Bloques temporales escritos |
| --- | ---: | ---: |
| Anterior, muestra 1 | 279.064 ms | 177 |
| Anterior, muestra 2 | 274.570 ms | 177 |
| Lotes de diez | 291.396 ms | 0 |

Son muestras aisladas, no percentiles ni pruebas concurrentes. Los lotes de dos también eliminaron temporales, pero tardaron aproximadamente 549–562 ms; por eso no se eligieron para el límite del servidor. La equivalencia del JSON completo para los cien establecimientos se comprobó en el servidor sin modificar datos. El límite del cliente de dos establecimientos por petición se conserva; aborda por separado el tamaño de cada petición y la devolución de sus huellas de revisión.

El editor y el portal distribuyen las comprobaciones periódicas entre el intervalo base y un 20% adicional, evitando una cohorte que consulte toda a la vez y sin aumentar la frecuencia de sondeo. Los eventos, los guardados locales y el retorno de conexión conservan sus vías inmediatas. No cambia el protocolo por campo, el UUID de reintento ni la prevalencia del último guardado del servidor.

Estas dos correcciones están implementadas y probadas en la rama candidata. La migración de avance y la nueva interfaz **no están publicadas**, porque sigue sin cumplirse la condición anterior de aprobar las pruebas integradas de carga antes de publicar. No se aumentaron límites de espera, cuotas ni facturación para aprobar una prueba.

Sí se completó la limpieza pendiente de las pruebas anteriores y se restauraron los predicados originales de lectura mediante `20261026013302_restore_original_read_permissions.sql`. Eso retira la selección experimental por JWT de las políticas usadas por cuentas reales, conservando sus OID y permisos. Las funciones auxiliares de comparación siguen privadas.

## Validación

- 234 pruebas aprobadas, cero fallos y cero omisiones, incluidas las de Chrome/PDF. Compilación aprobada.
- Prueba de resultados y permisos de avance con 100 establecimientos y 100 equipos diferentes; una cuenta ajena no recibe resultados y no puede ejecutar el auxiliar privado.
- Instrumentación en Postgres embebido verifica que ninguna invocación del cálculo recibe más de diez evaluaciones.
- Prueba aparte con un coordinador y tres evaluadores: cuatro versiones de cliente obsoletas conservan campos distintos; el último guardado del mismo campo prevalece y reintentar una operación antigua no revierte un guardado posterior. El runtime embebido serializa las transacciones: no se presenta como una prueba de carga real con cuatro dispositivos ni con 400.
- La recuperación de los 85 borradores anteriores se hizo mediante 87 reenvíos controlados del RPC de guardado, conservando 70 UUID originales. Se autenticó el contexto SQL de cada actor ficticio y se comprobaron marcador, sesión, país y registro; no se afirma que esto sea una prueba de reconexión automática del navegador.
- Reconciliación final: 62 694 parches aceptados, 326 campos finales, cero diferencias tanto al confirmar cada operación como frente al registro final por campo.
- Se retiraron únicamente las 202 cuentas ficticias, 100 establecimientos, 20 equipos y dependencias identificadas por UUID y marcador. Las 17 tablas reales coinciden exactamente en conteos y huellas con su inventario anterior, antes y después de la retirada. También se eliminaron los archivos privados de credenciales de esos fixtures.

## Qué ocurre con 400 personas

El plan Free admite 200 conexiones simultáneas de Realtime y 100 mensajes por segundo. Cuatrocientas sesiones de navegador abiertas a la vez superan el primer límite, incluso si cada establecimiento tiene solo cuatro integrantes. El SDK puede recuperar conexiones y la aplicación conserva un sondeo de respaldo; eso no acredita actualizaciones instantáneas, capacidad del backend ni ausencia de errores con 400 personas. Límites oficiales: https://supabase.com/docs/guides/realtime/limits.

La carga depende también del ritmo de guardado y del número de receptores. Por ejemplo, si cada persona guardase cada cinco segundos, serían 80 guardados por segundo. Con cuatro receptores por cambio, serían aproximadamente 320 mensajes por segundo, antes de sumar administradores y otros eventos. Es un cálculo ilustrativo bajo esa hipótesis, no una medición ni una promesa de rendimiento.

Para validar el escenario se necesita un límite de Realtime que cubra 400 conexiones más margen, capacidad de memoria suficiente y una prueba controlada con exactamente 100 equipos de cuatro, un establecimiento por equipo. Subir un plan elimina ciertos límites, pero no garantiza por sí solo el rendimiento. No se ejecuta otra carga de 400 sobre Nano/Free para volver a saturar un recurso cuyo límite de conexiones ya es insuficiente.

No se ha reiniciado el proyecto ni se ha cambiado su plan. Evidencia detallada local: `memoria-capacidad-100x4-2026-10-25.json`, `carga-coordinada-recuperacion-final-servidor.json` y `carga-coordinada-cierre-verificado.json`.
