# Investigación de las pruebas de 85, 100 y 125 evaluadores

## Por qué 85 podía fallar y 100 pasar

Las mediciones anteriores se hicieron en momentos distintos. Hubo latencias variables de extremo a extremo y una cancelación SQL por tiempo de ejecución en la etapa de 85. Un resultado aislado de 100 sin errores no establecía un límite garantizado de capacidad.

Se confirmaron además dos amplificadores en el generador anterior. Su lectura periódica podía coincidir con el guardado del mismo evaluador, a diferencia del módulo real, que coordina ambas tareas con `inFlight`. Su envoltorio de `fetch` sustituía la señal de cancelación por una señal nueva de 20 segundos. El SDK consideraba ese `TimeoutError` externo reintentable en lecturas GET: una consulta podía hacer cuatro intentos y durar más de 80 segundos. Esto no implica que las escrituras POST se repitieran por ese mecanismo. La prueba de regresión reproduce el comportamiento con el SDK fijado en el proyecto.

Los logs del backend de la etapa anterior de 125 también mostraron esperas: P95 aproximado de origen/upstream de 8.47/5.71 segundos en `wash_command` y 12.53/11.19 segundos en `wash_editor_sync`. No se puede atribuir todo a un error del generador ni identificar una causa física de infraestructura sin mediciones adicionales.

## Correcciones

- El cliente desactiva los reintentos implícitos. La versión final aplica veinte segundos al envío de red después de obtener el token, conservando la señal de cancelación original (véase la sección de renovación). La aplicación conserva la responsabilidad del reintento, con el mismo identificador de operación.
- Ante fallos, editor y panel esperan progresivamente entre reintentos automáticos, con variación aleatoria. El trabajo local sigue guardándose durante la espera. Recuperar conexión o foco permite comprobar nuevamente el estado.
- Las evaluaciones de varios establecimientos se consultan en lotes de hasta 100 IDs, con paginación de 500 filas. Un grupo de 20 establecimientos deja de generar 20 lecturas individuales de evaluaciones. Se conserva RLS.
- El cálculo de avance se dividió inicialmente en lotes de diez y, tras dos cancelaciones SQL adicionales, la versión final usa dos establecimientos por lote, procesados en serie. El listado completo incluye IDs previamente conocidos para detectar también pérdida de acceso o eliminación. Si falla un lote, no se publica un resultado parcial ni se adelantan las huellas de revisión.

La primera etapa completa de 85 todavía produjo una cancelación SQL real `57014` en `wash_progress_sync` del administrador. Esa etapa no se aprueba, aunque sus 765 comprobaciones de campo coincidieran con el servidor. Antes de limitar el avance, una medición autorizada sin carga de 100 establecimientos tardó 879.7 ms y usó bloques temporales; la de diez tardó 110.5 ms sin bloques temporales. Son ejemplos de ejecución, no percentiles ni una promesa de latencia. El cambio limita el trabajo por sentencia sin elevar el límite de ejecución.

El generador también corrigió una espera incorrecta al volver a escribir una fecha que ya tenía ese mismo valor: eso es una operación sin cambios, no un guardado pendiente. La repetición usa fechas distintas por actor y cuenta separadamente cualquier operación sin cambios. Esas esperas del generador no se reportan como pérdida de datos de la aplicación.

No se cambia el algoritmo de combinación por campo ni el orden de versión confirmado por servidor. No se aumentan límites de espera SQL, planes de pago ni permisos.

## Método de repetición

Se ejecutan los archivos reales `platform-client.js` y `platform-editor.js` en contextos aislados, con Vue y su observador profundo de cambios, guardado automático a los 800 ms y el mismo SDK de Supabase. Las suscripciones Realtime, autenticación, RLS y peticiones PostgREST llegan al backend actual. Un adaptador en memoria conserva la última copia local por clave en este generador; la persistencia IndexedDB de navegador y la interfaz se verifican por separado en Chrome. Un administrador utiliza el panel real compilado en Chrome.

Se prepararon 100 establecimientos, 20 equipos y cuentas ficticias, restringidas por un marcador y UUID. Veinte establecimientos reciben cambios concurrentes de indicador, plan y monitoreo, incluidos campos compartidos. Cada actor espera el acuse de su cambio y cinco segundos antes del siguiente; no es una prueba de llegada ilimitada. Los 300 segundos empiezan después de incorporar todas las cuentas y confirmar suscripciones. La incorporación, el drenaje y la comprobación se registran aparte.

Se contrastan los valores de los clientes con una lectura autorizada actual del servidor. Adicionalmente se reconcilian las modificaciones de campo aceptadas en `wash_operations` con el registro final, tomando la mayor versión aceptada por campo. No se usa únicamente el último acuse recibido para inferir pérdida de datos.

El intento de usar un navegador aislado completo por evaluador se interrumpió durante la incorporación por agotamiento de memoria del equipo generador. Tampoco cuenta la primera ejecución del módulo con `fake-indexeddb`: esa biblioteca retiene transacciones finalizadas y agotó el heap del generador. Se sustituyó únicamente el almacenamiento del generador por el adaptador acotado; no se cambió IndexedDB de producción por almacenamiento en memoria. Estos intentos no cuentan como pruebas aprobadas ni como fallos de capacidad del servidor. El piloto de dos navegadores sí comprobó el guardado real antes de iniciar la carga del módulo.

## Alcance

Esta medición no equivale a 125 teléfonos físicos, no incluye renderizado de sus interfaces ni exportaciones simultáneas de PDF, fotos o Drive. Cinco minutos sin errores bajo esta carga no garantizan capacidad sostenida durante horas ni desde cualquier red. La condición para publicar es que las tres etapas terminen sin errores y sin discrepancias de datos.

## Comprobación con transporte e IndexedDB nativos

La repetición posterior ejecuta los módulos reales de cliente y editor en páginas de Chrome. Conserva fetch e IndexedDB nativos y el guardado diferido de 800 ms. Para ajustar la memoria del equipo se comparte un contexto de navegador: cada página usa una clave Auth distinta en sessionStorage y los borradores mantienen las claves por usuario de la aplicación. Antes de medir se comprueba que las identidades coinciden con los evaluadores esperados. Se omiten el DOM y Vue de los evaluadores y el Service Worker durante la carga; el administrador sí usa el panel completo. La interfaz y la reapertura offline se verifican aparte en perfiles independientes.

Las páginas de las etapas registradas estaban visibles. Chrome negoció HTTP/3 en esta conexión. El resultado no debe extrapolarse automáticamente al transporte HTTP del generador Node ni a cualquier red física.

La serie anterior a la ruta directa produjo:

| Evaluadores | Guardados confirmados | Eventos de error | Campos contrastados | Diferencias finales |
| ---: | ---: | ---: | ---: | ---: |
| 85 | 3017 | 0 | 765 | 0 |
| 100 | 2671 | 90 | 900 | 0 |
| 125 | 2121 | 227 | 1125 | 0 |

Las tres ventanas de entrada duraron 300 segundos, más el drenaje y la verificación. Las etapas de 100 y 125 se reprobaron pese a recuperar todos los pendientes. Se conserva esta evidencia en `carga-coordinada-nativa.json`. La reconciliación acumulada hasta ese punto encontró 20254 modificaciones aceptadas de campo y 326 campos resultantes sin diferencias. No se concluye pérdida de datos a partir de una respuesta agotada, ni se ocultan los errores recuperados.

## Ruta directa de guardado por campo

La cadena anterior recorría capas destinadas a altas, exportaciones y flujo de evaluación, con consultas y comprobaciones repetidas durante un guardado. La migración aditiva `20261024155105_direct_field_save` incorpora `wash_command_fields` y `wash_private.save_fields`. Para parches se conserva la combinación por campo y la compatibilidad del UUID de operación; después se reutiliza el validador y escritor original `legacy_command`, incluidos permisos, bloqueos, versión, fotos, tipos, auditoría y bitácora. Los demás comandos y los clientes anteriores mantienen `wash_command`.

La interfaz candidata selecciona la ruta nueva solo para `save_record` con `field_changes`. No se amplían permisos. Las pruebas de sincronización SQL corren por ambas rutas y comprueban también reintentos cruzados entre ellas. La verificación de seguridad cubre propietario sin participación, persona ajena, cuenta suspendida, medición validada, puntuación y gravedad inválidas, texto excesivo, rutas de campo prohibidas y referencias de fotos inválidas.

La medición alternada sobre un establecimiento ficticio, dentro de una transacción revertida, mostró medianas posteriores al calentamiento de aproximadamente 8.1 ms y 6.6 ms. Otra muestra en conexiones distintas dio aproximadamente 7.6 ms y 5.2 ms. La primera llamada depende del calentamiento compartido y del orden: no se utiliza la comparación inicial de 194 frente a 13 ms como una mejora atribuible a la ruta. Estas mediciones aisladas no sustituyen la repetición concurrente.

Se aprobaron 225 pruebas de regresión, incluidas las de Chrome/PDF, y la compilación. La ruta nueva se instaló para probarla con las cuentas ficticias, conservando la interfaz publicada anterior hasta cumplir la condición de las tres etapas.

## Verificación y permisos bajo carga

La serie con guardado directo aprobó 85 (3055 acuses, cero errores, 765 campos coincidentes). Con 100, la ventana de edición no registró errores, pero la lectura masiva posterior del verificador agotó el tiempo: esa etapa no se considera aprobada. Con 125 hubo errores durante la edición antes de verificar, por lo que no se atribuyen solo al verificador. Los borradores pendientes se conservaron con el UUID original para recuperarlos.

La nueva verificación lee secuencialmente los veinte contextos mediante el RPC del editor, evitando el listado REST masivo de registros con permisos por fila. Se conservan los errores de las series anteriores.

Se observó una consulta de autorización de Realtime activa durante varios segundos al degradarse 125. Se aplanaron dos predicados de lectura, eliminando llamadas anidadas y evaluando la identidad una vez. Una matriz compara los resultados nuevos y anteriores para propietario, administradores, miembros, participantes activos, ajenos, IDs inexistentes y revocaciones; las demás políticas siguen aplicándose. La migración de ensayo selecciona la ruta nueva solo mediante metadatos firmados de las cuentas ficticias; las cuentas reales mantienen la ruta anterior hasta decidir la promoción. No se usan metadatos editables por el usuario.

El script reproducible más reciente es scripts/load-coordinated-native.cjs, con la pasarela scripts/coordinated-qa-proxy.cjs. Requiere fixtures y sesiones privadas fuera del repositorio. No debe ejecutarse sin configurar y verificar los UUID y el marcador de prueba.

## Renovación de sesión y presupuesto de red

La serie con permisos planos falló en 85 por dos cancelaciones SQL 57014 del progreso, con 765 campos coincidentes. En 100 hubo 498 eventos de error y cien esperas de confirmación de 120 segundos agotadas; finalmente los cien guardados llegaron y 900 campos coincidieron. Esa ventana no acredita edición sostenida: los actores dejan de introducir cambios al agotar su espera, aunque el editor continúa recuperándose automáticamente. El campo histórico unconfirmed registra esos vencimientos, no el número de envíos pendientes al cierre.

En la ventana de 100, los logs registraron 55 renovaciones Auth con P95 de origen 28.3 segundos y máximo 30.722 segundos. El P95 de las respuestas correctas de editor_sync fue 1.545 segundos y el máximo 19.807. No se considera demostrado un límite físico de CPU o una cuota concreta de Realtime.

Una prueba determinista con el SDK fijado reproduce que su temporizador de consulta también corre mientras espera obtener el token de acceso. La corrección final inicia el plazo de veinte segundos en fetch, después de la autenticación del SDK, y combina la señal de cancelación del llamador con la del plazo; no sustituye ni ignora cancelaciones. Los reintentos implícitos siguen deshabilitados. La prueba verifica tanto token lento con red rápida, como plazo de red agotado, cancelación explícita y un único intento. No se amplía el plazo de la petición de red.

El progreso pasa a grupos de dos establecimientos en serie. Se mantiene la agregación completa antes de actualizar el panel. La repetición final incorpora una renovación real simultánea de las sesiones ficticias al segundo 90 de cada ventana, además de la edición: controla una variable que antes dependía de la antigüedad de cada token. Las peticiones Auth se observan sin guardar cuerpos, cabeceras ni tokens en el informe.

## Límite de autenticación comprobado

La consola de este proyecto muestra 150 renovaciones por cinco minutos y por IP (1800 por hora). La documentación oficial describe además una ráfaga de hasta treinta renovaciones: https://supabase.com/docs/guides/deployment/going-into-prod#auth-rate-limits. No se cambió este límite ni se desactivó una protección de autenticación.

La renovación explícita simultánea es un escenario de estrés adicional al de edición con sesiones ya abiertas. Todos los actores de este generador salen por una misma IP; no representa una carga distribuida entre redes independientes. En la etapa corregida de 85 hubo 77 respuestas Auth 429 y ocho renovaciones aceptadas. Los eventos de error también incluyen el error devuelto al solicitar esa misma renovación, por lo que el total de eventos no equivale a peticiones únicas. Los 765 campos coincidieron y todas las sesiones del editor estaban sincronizadas al verificar. La etapa se reprueba de todos modos.

En la de 100 se aceptaron 31 renovaciones y se rechazaron 69 con 429. La edición se recuperó y continuó, pero se registraron 219 eventos de error: no se convierte una recuperación posterior en una prueba sin errores.

Una ráfaga de renovación no mide por sí sola el máximo de evaluadores que editan con un token válido, pero revela una condición que debe resolverse para certificar el flujo completo. No se infiere del número 125 un límite universal de capacidad ni se elimina este escenario del informe para aprobar la publicación.

## Corrección de la concentración de renovaciones

El cliente conserva el respaldo de renovación del SDK y programa además una renovación anticipada entre siete y dos minutos antes del vencimiento, eligiendo una espera aleatoria por sesión. Un evento de token nuevo cancela la espera anterior y programa solo la siguiente. Salir cancela el temporizador; sin conexión no se renueva y al reconectarse se vuelve a programar. Los fallos temporales usan espera creciente con variación aleatoria. No se cambian JWT, duración autorizada, roles ni cuotas del servicio. Esto evita que una cohorte activa que entró junta renueve toda a la vez. No convierte una ráfaga arbitraria de inicios de sesión o de sesiones ya vencidas en una carga sin límites.

Tres pruebas con reloj controlado cubren distribución para el mismo vencimiento, cancelación offline/salida y reintento sin bucle inmediato. La regresión completa pasa 230 pruebas, incluidas las de Chrome/PDF.

La última serie usa el temporizador real de producción. El generador captura únicamente el callback del cliente y le adelanta el vencimiento de programación a 370 segundos, de modo que las renovaciones se repartan en los primeros 250 segundos reales de la ventana. No altera los JWT firmados ni el reloj del servidor ni sus cuotas. Cada actor debe completar una renovación real y conservar su identidad; cualquier HTTP 429 sigue contando como fallo aunque se recupere. El piloto de diez usa un vencimiento de programación de 125 segundos y duró quince segundos de entrada más drenaje.

La comparación final toma una lectura de servidor, las vistas de los clientes y otra lectura de servidor. Solo acepta una versión estable y valores coincidentes. Espera la convergencia automática hasta 180 segundos fuera de la ventana de entrada y registra cada intento; no fuerza un refresco del editor ni descarta diferencias iniciales. Esto evita comparar vistas capturadas antes de un guardado tardío contra una lectura posterior mientras el servidor todavía cambia.

Tras la serie de ráfaga fallida, las 125 cachés tenían cero registros lógicos sucios y cero envíos pendientes. Reabrirlas con el módulo real hizo coincidir sus 1125 campos con el servidor, sin errores. La reconciliación autoritativa de 46215 parches aceptados y 326 campos resultantes no encontró diferencias. Las once diferencias vistas al comparar el final de la ráfaga de 125 se conservan como fallo de convergencia de esa ejecución; no se presentan como pérdida de registros aceptados.

## Reutilización de IndexedDB y aislamiento del generador

Se encontró que rememberOfflineEvaluation creaba un WashStorage nuevo en cada persistencia, abriendo repetidamente conexiones a la misma base. El cliente ahora reutiliza el almacén por usuario tanto al actualizar como al leer el índice offline. Una prueba hace cien actualizaciones, comprueba una sola creación por usuario y confirma que dos cuentas no mezclan sus listados. La regresión pasa 231 pruebas.

La primera serie con renovación distribuida y un único origen aprobó 85: cero errores, 85 renovaciones reales y 765 campos coincidentes. En 100 se completaron las cien renovaciones sin Auth 429, pero hubo 369 fallos de red por plazo y 900 campos coincidieron al cierre. En 125 solo se incorporaron 83 sesiones antes de un error de red al iniciar el editor: esa etapa no llegó a la ventana de cinco minutos y no se presenta como una prueba completa.

Ese generador compartía también una única base IndexedDB y su objeto drafts entre todas las páginas. Aunque los datos estaban separados por claves de usuario, las transacciones de escritura del mismo objeto se serializan; esto difiere de dispositivos separados. La última metodología usa un puerto/origen loopback por actor, sirviendo exactamente el mismo dist y backend existente, con IndexedDB y localStorage nativos independientes. Se conserva el navegador compartido para limitar memoria. No se sustituye el almacenamiento por un mapa en memoria ni se reparten IP públicas para eludir límites: todos siguen saliendo por la misma IP. Esta corrección metodológica no demuestra por sí sola que el almacenamiento explique cada fallo anterior.

Se añaden diagnósticos de consola de red sin cuerpos ni cabeceras de autenticación; las URL se reducen a su ruta. Los scripts versionados son scripts/coordinated-qa-proxy.cjs (puertos 62000–62201) y scripts/load-coordinated-native.cjs. Exigen los fixtures privados y el marcador autorizado. Las cuotas, índices de permisos y algoritmo de combinación por campo permanecen en el mismo proyecto.

## Control con motores de Chrome independientes

La serie con orígenes separados, pero un solo motor, aprobó 85; falló con 100 (731 eventos de error) y con 125 (1014 eventos, incluidas renovaciones Auth 504 y 429). La caché final de 125 no tenía envíos pendientes ni registros lógicos sucios. Esos fallos se conservan en `carga-coordinada-origenes-aislados.json`; no se consideran pruebas aprobadas por haberse recuperado los guardados.

El control siguiente reparte como máximo 25 evaluadores por instancia independiente de Chrome: cuatro instancias para 85 y 100, cinco para 125. Cada actor conserva su propio origen y almacenamiento nativo. Todos utilizan la misma máquina, IP pública, backend y código candidato. Se registran las huellas SHA-256 del código, los tiempos de las peticiones fallidas y muestras de protocolo y conexión. No se cambian los límites de autenticación ni de ejecución SQL, y el plazo de red continúa siendo veinte segundos. Este control permite contrastar el efecto de compartir un motor; por sí solo no demuestra un límite del servidor ni representa dispositivos físicos independientes.

Antes del control se renovó mediante inicio de sesión normal únicamente a las diez cuentas ficticias afectadas por respuestas Auth 504, para no reutilizar un token de rotación cuya respuesta se hubiera perdido. Se conservaron sus UUID, contraseña, roles y datos. Las diez renovaciones finalizaron correctamente. El piloto de diez actores y quince segundos pasó sin errores; no sustituye las etapas de cinco minutos.

## Interrupción de servicio durante el control de motores separados

El 24 de octubre de 2026, la etapa de 85 incorporó todas las cuentas y completó 300.008 segundos de entrada. Durante los primeros 150 segundos no registró errores; después se detuvieron las confirmaciones. Se registraron 1985 guardados confirmados, 621 eventos de error y 85 esperas de confirmación agotadas. Los eventos incluyen distintas operaciones y reintentos; no equivalen a 621 guardados perdidos.

En la ventana 19:08:30–19:11:30 UTC, los logs de la pasarela de Supabase muestran trece respuestas Auth 522 con tiempos de origen cercanos a 90000 ms. Antes de la interrupción, las respuestas correctas de guardado tenían tiempos de origen inferiores a 300 ms. Dos controles independientes con fetch de Node, fuera de Chrome y sin modificar datos, recibieron la configuración de Vercel en aproximadamente 0.5 segundos, pero agotaron veinte segundos tanto en `/auth/v1/health` como en `wash_account_status`. La consulta de integridad por el canal SQL del conector también terminó con un timeout. Que la API de administración indicara ACTIVE_HEALTHY no acreditó la disponibilidad de la API pública o de SQL.

Un 522 significa que la pasarela no pudo contactar a tiempo con el servicio de origen; no identifica por sí mismo CPU, memoria, cuotas de Realtime ni una consulta concreta como causa. Referencia: https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-522/. No se afirma haber demostrado agotamiento de recursos físicos o pérdida de cambios aceptados.

Los intentos de 100 y 125 quedaron bloqueados al establecer la primera sesión. No llegaron a una ventana de edición de cinco minutos y no se presentan como pruebas completas. Se añadió un límite de sesenta segundos al establecimiento de sesión y a la conexión del generador para no dejar una incorporación colgada indefinidamente. El primer intento de 100, detenido después de más de tres minutos sin incorporar actores, se conserva por separado.

Los 85 borradores se exportaron antes de cerrar los navegadores, incluidos los UUID originales de operaciones en vuelo. Los 85 contienen modificaciones lógicas pendientes. Su recuperación, la reconciliación final, la retirada de fixtures y la comparación de los datos reales con el inventario inicial quedan pendientes de recuperar el servicio. No se elimina esa evidencia ni se afirma que esas comprobaciones hayan pasado. La última reconciliación anterior a la interrupción había contrastado 46215 parches aceptados y 326 campos sin diferencias; no sustituye la reconciliación de esta última etapa.

La interfaz candidata no se publica. La consola ofrece reiniciar el proyecto, con unos minutos de indisponibilidad; se solicitó autorización específica antes de aceptar su aviso de confirmación. No se cambiaron planes, cuotas, credenciales ni los datos reales para intentar aprobar la prueba.

Evidencia: `carga-coordinada-motores-separados-522-attempt.json`, `carga-coordinada-motores-separados-remaining-after-522.json`, `carga-coordinada-diagnostico-522.json` y `carga-control-red.ndjson`, en la carpeta de resultados local. La regresión del código candidato había aprobado 231 pruebas y la compilación; ese resultado no permite ignorar esta interrupción de la prueba integrada.
