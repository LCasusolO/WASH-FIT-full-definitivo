# Pruebas de carga y concurrencia

Fecha: 23 de octubre de 2026, Lima.

## Entorno y alcance

Se simularon **100 establecimientos, 50 evaluadores y 10 equipos**, con cuentas y datos ficticios. Cada evaluador envía solicitudes HTTP concurrentes al adaptador local que ejecuta las mismas funciones SQL, autorizaciones y operaciones idempotentes de la aplicación. No se generó carga contra evaluaciones reales ni se modificaron sus respuestas.

El motor es PostgreSQL embebido mediante PGlite, con un único motor que serializa las sesiones. Por tanto, estas pruebas demuestran el comportamiento del código y permiten comparar consultas, pero **no miden la capacidad máxima de Supabase/Vercel ni equivalen a 50 conexiones nativas de PostgreSQL ejecutándose en paralelo**. Los tiempos corresponden a esta máquina, sin latencia WAN. Las mediciones finales se ejecutaron separadas de la suite de Chrome.

## Problemas encontrados y corregidos

1. **Cálculo cuadrático de pendientes.** El cálculo copiaba un JSON creciente después de agregar cada campo. Se sustituyó por acumulación en un array PostgreSQL, sin modificar reglas de completitud, aplicabilidad ni enlaces. Una prueba compara íntegramente la respuesta anterior y la nueva en escenarios incompletos, completos y con brechas.
2. **Búsquedas repetidas sin un índice ajustado a la consulta.** Se agregaron índices para la identidad del indicador y para las últimas acciones y registros de monitoreo por indicador/equipo.
3. **Demasiados datos para una lista.** El portal descargaba todos los registros e historiales y todos los enlaces a pendientes. Ahora la lista recibe porcentajes y cantidades. Los enlaces completos se consultan al desplegar el establecimiento. El historial consulta únicamente el establecimiento seleccionado y los últimos 200 eventos, sin los contenidos completos de antes/después.
4. **El editor repetía la descarga de otros expedientes del mismo establecimiento.** Ahora carga los indicadores de la medición abierta y consulta por separado su plan/monitoreo compartidos; no descarga los indicadores de las otras mediciones del establecimiento.
5. **Una prueba dependía del orden incidental de una consulta sin ORDER BY.** El nuevo índice cambió ese orden y reveló una aserción que tomaba el primer indicador. Se corrigió la prueba para localizar explícitamente `A_1a`; el snapshot y su puntuación no cambiaron.

No se añadió una caché persistente de progreso que pueda quedar obsoleta. El resumen se sigue calculando con los datos autorizados del servidor. La comprobación final sigue usando todos los campos y los bloqueos existentes.

## Comparación con los mismos datos

Línea base: código anterior a esta optimización, 100 establecimientos y 10.100 registros. Respuesta SQL completa frente al resumen de la lista optimizada:

| Medida | Antes | Después |
| --- | ---: | ---: |
| Consulta de avance para 100 evaluaciones | 17.769 ms | 1.239 ms |
| Tamaño del resultado de avance | 10.927.312 bytes | 43.012 bytes |
| Cálculo completo, conservando todos los enlaces | 17.769 ms | 1.371 ms |
| Descarga global de registros desde la lista | 10.100 registros, unos 3,86 MB | No se solicita |

El resumen reduce aproximadamente **99,6%** del volumen de esa respuesta. El tiempo mostrado mide la consulta local, no la carga completa de una página en internet. La respuesta completa sigue disponible para un establecimiento concreto, al abrir sus pendientes o finalizar la evaluación.

## Escenarios de concurrencia

| Escenario | Guardados nuevos | Reintentos con el mismo identificador | Consultas de avance | Errores finales | Campos finales comprobados |
| --- | ---: | ---: | ---: | ---: | ---: |
| Línea base, indicadores | 500 | 50 | 0 durante la ráfaga | 0 | 300 |
| Optimizado, indicadores | 500 | 50 | 0 durante la ráfaga | 0 | 300 |
| Mezcla de lectura y edición de indicadores | 1.000 | 50 | 200 | 0 | 300 |
| Indicadores, plan y monitoreo anidado | 1.000 | 50 | 200 | 0 | 600 |

En el último escenario hay 10.300 registros. Se comprobaron notas, descripción del problema, riesgos, acciones, recursos, responsables, comentarios de monitoreo, medidas correctivas y fechas anidadas. Varios evaluadores modifican registros compartidos. Para cada campo se conserva el valor cuya respuesta tiene la mayor versión aceptada; campos distintos del mismo registro conservan ambas ediciones. Repetir una operación devuelve su versión original y no deshace cambios posteriores.

Último escenario, 50 trabajadores HTTP simultáneos, 1.250 solicitudes en total:

- Duración de la fase concurrente: **25,62 s**.
- Guardados: mediana **98 ms**, percentil 95 **124 ms**, máximo **130 ms**.
- Consultas de listas: mediana **5,85 s**, percentil 95 **6,02 s**, incluyendo la espera en la cola del único motor SQL de la prueba.
- Rendimiento agregado: **48,8 solicitudes/s** en esta ejecución local.
- Errores finales: **0**.

La latencia de lectura concurrente es relevante: no debe interpretarse el tiempo individual de 1,24 s como latencia garantizada con todos los lectores a la vez. La prueba local serializa esas consultas; faltaría medir con un proyecto de staging de igual infraestructura y red que producción antes de ofrecer una garantía de capacidad o un SLA.

El servidor HTTP de prueba utiliza un keep-alive suficiente para no confundir su cierre de conexiones inactivas con errores de la aplicación durante las consultas SQL del motor embebido. No se modificaron las políticas de conexión de producción para ocultar errores.

## Regresión y verificación visual

**207 pruebas aprobadas** y compilación correcta. Incluyen comparación de la lógica de completitud anterior/nueva, permisos del resumen, paginación limitada de historiales, conservación de snapshots, sincronización por campo, trabajo offline, reapertura, validación, transferencias, reportes Chrome simultáneos y reintentos de Drive.

En el navegador se comprobó que la lista conserva los porcentajes y el conteo de pendientes. Al desplegar un caso con 98 pendientes, se recuperaron los **98 enlaces**, sin dejar un estado de carga permanente. La captura de QA es `carga-pendientes-pc.png`.

## Reproducción

Después de instalar las dependencias del repositorio:

```powershell
$env:LOAD_FACILITIES='100'
$env:LOAD_EVALUATORS='50'
$env:LOAD_ROUNDS='20'
$env:LOAD_READ_EVERY='5'
$env:LOAD_WITH_PLAN='1'
npm run test:load
```

El resultado se guarda en `work/load-results.json`. `LOAD_REPORT` permite elegir otro destino. Sin las opciones de lectura/plan se ejecuta la ráfaga básica de indicadores. El script solo usa su base embebida y un puerto HTTP local temporal; no consulta credenciales de producción. Los resultados comparativos de esta entrega están en `carga-antes.json`, `carga-despues.json`, `carga-mixta.json` y `carga-plan-monitoreo.json`.

## Límites

No se hizo una prueba de carga contra GoTrue, la red móvil física, el CDN, el almacenamiento de fotos, el repositorio real de Drive o la cuota del proyecto Supabase de producción. La carga cubre lecturas de avance y guardados de evaluadores. La suite aparte verifica tres renderizados Chrome simultáneos y la coordinación de exportaciones entre cuentas; no se afirma haber probado 50 generaciones de PDF simultáneas. No se garantiza capacidad para volúmenes superiores a los ejecutados aquí.

## Medición posterior en la plataforma publicada

Después de esta comparación local, se ejecutó una prueba controlada en la infraestructura real, con cuentas y establecimientos ficticios y autorización explícita del propietario. Los niveles verificados, los tiempos de espera observados con 25 evaluadores y la limpieza comprobada se documentan en [CAPACIDAD-PRODUCCION.md](CAPACIDAD-PRODUCCION.md). Esta nueva prueba no convierte los tiempos locales anteriores en una garantía de producción.
