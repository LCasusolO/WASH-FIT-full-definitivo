# Capacidad observada en producción

**Registro histórico anterior a la sincronización incremental.** La medición posterior de 25, 35 y 50 evaluadores y los cambios publicados se documentan en [SINCRONIZACION-INCREMENTAL.md](SINCRONIZACION-INCREMENTAL.md). Los límites de este documento corresponden a la versión anterior.

Fecha: 23 de octubre de 2026, Lima. Prueba autorizada expresamente por el propietario sobre la plataforma actual, todavía sin uso operativo.

## Resultado operativo

Se verificaron **20 evaluadores simultáneos y un administrador con el panel activo**, con 100 establecimientos registrados y 20 establecimientos abiertos por los evaluadores. En la comprobación sostenida de cinco minutos se confirmaron **1145 guardados**, sin errores HTTP/RPC, sin fallos de suscripción y sin diferencias en los campos comprobados. El percentil 95 de guardado fue **0.47 segundos**. Cada cliente volvió a consultar sus datos y coincidió con el último cambio aceptado.

Esto es un nivel verificado bajo la carga descrita, **no un máximo universal ni una garantía indefinida**. Como margen operativo inicial conviene planificar 15 evaluadores activos; 20 fueron verificados. Con 25 aparecieron esperas superiores a 20 segundos y se detuvo el aumento. No se ensayaron 50, 100 o 200 sesiones activas en producción tras ese resultado.

## Infraestructura y carga

- Plataforma publicada en Vercel; API, autenticación y Realtime reales de Supabase en `us-east-1`.
- Plan Supabase Free; PostgreSQL 17.11, `max_connections=60`, `shared_buffers=224MB`, `work_mem=2184kB`. No se cambió el plan ni se contrataron recursos.
- 100 establecimientos ficticios, 20 equipos, 202 cuentas de prueba (200 disponibles y dos para administración/verificación), 10.300 registros de prueba. Solo se activaron las cuentas necesarias para cada etapa.
- Una sesión autenticada distinta por evaluador. Inicio de sesión escalonado, no una prueba de acceso masivo en un único instante.
- Cada evaluador intenta guardar un campo cada cinco segundos, alternando indicador, acción y monitoreo anidado; versión local antigua para comprobar la combinación por campo.
- Se reproducen las ocho consultas del editor, su actualización periódica cada cinco segundos y la reacción a notificaciones con espera de 300 ms. Lectura y escritura pueden coincidir en este generador, por lo que no se pretende reproducir exactamente los tiempos de cada interacción visual del navegador.
- Un administrador consulta los listados paginados y el avance de los 100 establecimientos cada quince segundos, y tras notificaciones con espera de 500 ms.
- Clientes Node con el mismo SDK sobre internet desde esta máquina; no son 20 navegadores completos ni una prueba de memoria/rendimiento del teléfono.
- Los tiempos incluyen red, API y espera. La carga utiliza usuarios que esperan respuestas antes de su próximo guardado; no es una tasa fija de llegada ilimitada.

## Escalera y afinación

| Evaluadores | Establecimientos activos | Guardados confirmados | Solicitudes fallidas | P95 de guardado |
| ---: | ---: | ---: | ---: | ---: |
| 5 | 5 | 89 | 0 | 0.58 s |
| 10 | 10 | 176 | 0 | 0.47 s |
| 15 | 15 | 345 | 0 | 1.59 s |
| 20 | 20 | 460 | 0 | 0.64 s |
| 25 | 25 | 232 | 17 | 20.00 s |

Las etapas de 5, 10 y 25 utilizaron ventanas de 90 segundos; 15 y 20 se verificaron después durante 120 segundos. La etapa sostenida volvió a medir 20 durante 300 segundos, más el tiempo de drenaje y comprobación. Los umbrales de comodidad establecidos antes de medir fueron P95 de guardado de 2 s y P95 de lectura de 5 s. El generador deja de esperar una petición tras 20 s; ese tiempo no es un límite configurado en la interfaz de la app.

### Comprobación sostenida

| Medida | Resultado |
| --- | ---: |
| Evaluadores y administrador en tiempo real | 20 + 1 |
| Guardados confirmados | 1145 |
| Reintentos con el mismo identificador | 2 |
| Consultas individuales de lectura del editor | 12736 |
| Consultas de resumen de avance | 83 |
| P95 de guardado | 0.47 s |
| P95 de petición de lectura del editor | 0.45 s |
| P95 de avance del administrador | 1.89 s |
| Errores de solicitud | 0 |
| Campos contrastados en servidor | 60 |
| Campos contrastados desde los clientes | 60 |
| Diferencias de valor | 0 |

### Qué sucedió con 25 evaluadores

Diecisiete peticiones de guardado excedieron el plazo de 20 segundos del generador. Sus operaciones **sí habían sido confirmadas en la base de datos**. La primera comparación, que solo conocía las respuestas recibidas por el cliente, marcó 17 diferencias: estaba comparando valores anteriores con cambios posteriores cuyo acuse no llegó a tiempo.

Se contrastaron entonces los registros con la bitácora de operaciones aceptadas del servidor, tomando la mayor versión por campo. Las **653 modificaciones** acumuladas hasta ese punto coincidían con los **75 campos** resultantes: cero diferencias. No se ha presentado ese contador preliminar como pérdida de datos ni se ocultaron los 17 tiempos de espera. El mecanismo de la app conserva el identificador de una operación pendiente para reintentar sin aplicarla dos veces. Aun así, no se recomienda ese nivel de carga por la demora observada.

## Colisiones y reintentos

Se ejecutaron **10 evaluadores diferentes sobre los mismos tres registros de un establecimiento**, con 60 guardados en ondas simultáneas. Se modificaron tanto campos distintos como el mismo campo de indicador, plan y monitoreo. Los 9 campos finales coincidieron con la mayor versión aceptada de cada campo. Se retransmitió una operación antigua después de los cambios nuevos: devolvió su versión original y no deshizo los cambios posteriores. Errores: 0; diferencias: 0.

## Correcciones encontradas

Antes de esta prueba real, el cálculo de avance reconstruía los pendientes completos de las 100 evaluaciones para descartarlos después. Falló cuatro veces por `statement timeout` incluso con cinco evaluadores y un administrador. Se sustituyó por agregación SQL de conteos, conservando la comprobación completa para los enlaces y la finalización.

El plan de ejecución reveló además miles de invocaciones de una función SQL numérica no inlineable por su configuración de búsqueda. Se incorporó su misma expresión protegida por tipo dentro de la consulta masiva. No se aumentaron los límites de espera de Supabase para esconder el problema y no se abrió acceso a datos.

La función privada exige una cuenta lista y comprueba el permiso de cada evaluación antes de leer sus registros; el punto de entrada público conserva `SECURITY INVOKER`. Las pruebas comparan los resultados con la comprobación completa anterior: vacío, completo, brechas, hospitales, saneamiento in situ/alcantarillado, no aplicabilidad justificada, población inválida o límite y superposición de datos generales. También comprueban que una cuenta sin acceso no obtiene resultados ni pasando un ID directamente a la función privada.

**207 pruebas de regresión aprobadas y compilación correcta.** Las correcciones SQL están aplicadas en producción; sus migraciones y pruebas quedan versionadas.

## Protección y limpieza

Todos los cambios de carga se restringieron a UUID de prueba y cuentas marcadas en metadatos de administración. No se enviaron correos de prueba ni se exportaron archivos al Drive real. No se utilizó el usuario propietario para generar la carga.

Se retiraron los 202 usuarios ficticios y sus sesiones, los 100 establecimientos y sus evaluaciones, equipos, registros y operaciones de prueba. Se compararon conteos y hashes de las **17 tablas públicas de la aplicación** con la huella anterior: **todas coinciden**. Los contadores internos de secuencias y los logs operativos de Supabase pueden reflejar que se ejecutó la prueba; no se manipularon para ocultarla. Las credenciales temporales no se incluyen en este informe ni en Git.

## Evidencia y límites

Resultados: `capacidad-produccion-antes.json`, `capacidad-produccion-batch.json`, `capacidad-produccion-escalera.json`, `capacidad-produccion-afinada.json`, `capacidad-produccion-sostenida.json`, `capacidad-colisiones.json`, `capacidad-datos-originales-antes.json`, `capacidad-datos-originales-despues.json`. El generador reproducible es `scripts/capacity-remote.cjs`; requiere un manifiesto privado de cuentas de prueba y aceptación explícita mediante variable de entorno. Se debe preparar una nueva tanda de datos para repetirlo: las cuentas de esta ejecución ya no existen.

No se midió exportación masiva de PDF, fotos, Drive ni altas o accesos masivos simultáneos. No se promete el mismo resultado desde cualquier red móvil ni durante horas o días. Los recursos del plan Free y la infraestructura compartida pueden variar. Antes de superar el nivel verificado, o tras un crecimiento importante del catálogo, fotos, número de establecimientos o cambio de plan, debe repetirse la medición. Los 60 puestos de conexión PostgreSQL no equivalen a 60 evaluadores.
