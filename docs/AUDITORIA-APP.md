# Auditoría funcional y técnica de WASH FIT

Fecha: 23 de octubre de 2026 (Lima).

## Alcance y evidencia

Revisión de acceso y ciclo de cuentas, permisos por país/equipo, plataforma, creación y cierre de evaluaciones, aplicabilidad de indicadores, comprobación de cinco pasos, plan de mejora, monitoreo, trabajo sin conexión, sincronización por campo, informes, mapa, impresión y repositorio Drive. Se contrastó el recorrido interfaz → API → PostgreSQL → interfaz, junto con las pruebas existentes de las reglas de negocio.

Se utilizaron cuentas ficticias en un servidor local, PostgreSQL real embebido y los mismos handlers/SQL de la aplicación. Las pruebas de Drive simulan la API de Google y ejecutan las autorizaciones y reservas en PostgreSQL real. Las pruebas de renderizado utilizan Chrome. No se editaron evaluaciones reales para hacer la comprobación visual.

Resultados: **204 pruebas aprobadas**, compilación correcta y **cero vulnerabilidades conocidas reportadas por npm audit**, tanto en dependencias de producción como en el conjunto de dependencias revisado. El registro completo está en `outputs/cuentas-administradas/pruebas-auditoria-app.txt` del espacio de trabajo de entrega.

## Hallazgos corregidos

| Prioridad | Hallazgo | Corrección y comprobación |
| --- | --- | --- |
| P1 | Un coordinador podía reabrir una evaluación validada, capacidad que excede la regla ahora solicitada. | Corregir una versión validada queda restringido a propietario/administrador, en la interfaz y en el servidor. La comprobación se hace bajo bloqueo de la fila para evitar un cambio concurrente de estado. Pruebas SQL rechazan al coordinador y aceptan al administrador, conservando el snapshot anterior. |
| P1 | Una respuesta pendiente podía alcanzar asignaciones de estado después de cambiar de cuenta. | Las cargas verifican la identidad antes de aplicar sus resultados. Una respuesta o error de la cuenta anterior se descarta. Prueba con petición aplazada y cambio de sesión. No se afirma que hubiese ocurrido una filtración real. |
| P2 | `TypeError: Failed to fetch` podía mostrarse sin traducción. | Se reconoce el mensaje incluso con prefijo. El aviso explica que no se pudo conectar y que debe comprobarse el resultado de una operación antes de repetirla. Se reprodujo rechazando peticiones mientras `navigator.onLine` seguía siendo verdadero. |
| P2 | Un aviso de red podía persistir después de una actualización correcta, junto al estado verde. | Los fallos de red marcan la consulta como no sincronizada, no adelantan la hora y se limpian al completar una consulta posterior. Los errores de validación del formulario no se borran por esa recuperación. Comprobado automáticamente y en navegador. |
| P2 | El temporizador y los eventos podían iniciar cargas superpuestas. | Las cargas simultáneas de la misma cuenta comparten una petición en curso. Se comprobaron dos disparos concurrentes sin duplicar la consulta de cuenta. |
| P2 | Dos diseños diferentes de Evaluaciones producían duplicación de títulos y un inicio sin contexto para el coordinador. | Una tabla por establecimiento para los cuatro roles: país, nombre, evaluación/avance, equipo y acciones. Se muestran también los establecimientos sin evaluación. Se eliminó la repetición de tipo bajo el nombre. Un hospital nuevo se creó, asignó e inició desde su fila durante QA. |
| P2 | La tabla móvil dejaba ocultos avance y acciones a la derecha, mostrando grandes espacios en blanco. | La misma tabla presenta todos los campos de cada fila en bloques verticales en móvil y conserva las columnas en PC. Se comprobó que el documento no desborda horizontalmente a 390 px. |
| P2 | La reevaluación usaba el nombre de archivo de la medición inicial. | El servidor determina una identidad de reporte a partir de la exportación autorizada. JSON, PDF, título de impresión y Drive usan `_Reevaluación001`, `_Reevaluación002`, etc. Cada medición conserva su propia pareja compartida entre cuentas; una reevaluación no reemplaza la pareja inicial. |
| P2 | Una sesión de subida emitida antes del cambio de nombres podía conservar un destino antiguo. | Los comprobantes de archivado tienen versión. Un comprobante anterior se reinicia sobre la identidad actual del reporte, liberando su reserva anterior sin tocar la reserva de otra subida. Prueba de compatibilidad con comprobante firmado antiguo. |
| P3 | Se podía ofrecer iniciar con un equipo inactivo o sin coordinador. | La interfaz solo admite un equipo activo con coordinador y explica lo que falta. El servidor conserva su validación independiente. |

## Reglas visibles resultantes

- **En curso** agrupa los estados internos históricos `draft`, `editing` y `review` de una evaluación. **Validada** indica una medición finalizada. Los valores históricos internos se conservan para no alterar eventos o snapshots. Las mediciones antiguas en revisión continúan siendo editables por sus participantes autorizados; las validadas permanecen bloqueadas.
- **Falta evaluar** es una situación del establecimiento sin medición, no un estado adicional de evaluación.
- Una evaluación en curso se abre con **Continuar evaluación**; una validada con **Ver evaluación validada**.
- **Finalizar evaluación** comprueba los cinco pasos. Si faltan campos, no cierra y muestra sus enlaces. Si están completos, conserva la versión histórica y finaliza la medición. El monitoreo puede continuar.
- **Corregir versión anterior** solo aparece para propietario/administrador. Se bloquea si ya existe otra evaluación en curso en el mismo establecimiento, conforme a la regla del servidor.
- El coordinador puede iniciar mediciones del equipo asignado y finalizar las que coordina; el evaluador continúa las mediciones a las que tiene acceso. Ninguno puede reabrir una versión validada.
- El flujo de revisión de registros independientes de monitoreo conserva sus estados propios. La simplificación anterior corresponde a las evaluaciones integrales.

Ejemplo de archivos de reevaluación: `PER-Hospital_dos_mayo_Reevaluación001.json` y `PER-Hospital_dos_mayo_Reevaluación001.pdf`. Reexportar o imprimir la misma medición desde otra cuenta actualiza los mismos identificadores de Drive. El código no depende del texto enviado por el navegador. Para nombres antiguos sin código se calcula un orden estable por establecimiento en el servidor.

## Flujos comprobados

| Área | Evidencia |
| --- | --- |
| Acceso, confirmación, contraseña, suspensión y eliminación/reutilización | `managed-accounts`, `managed-flow`, `accounts-proxy`, `platform-api`; pruebas de cuentas/RLS y handlers. |
| Ámbitos de país, equipo, participantes y transferencias | `platform-database`, `team-transfer`, `platform-portal`; roles en navegador y permisos SQL. |
| Evaluación inicial y reevaluaciones | `evaluation-codes`, `completion-collaboration`, `platform-portal`; inicio directo de hospital nuevo y generación de Reevaluación 01. |
| Datos generales, indicadores, aplicabilidad, riesgos y JMP | `assessment-validation`, `sanitation-catalog`, `jmp-matrix`, `core`, `location`. |
| Completitud de cinco pasos y corrección de versión | `completion-collaboration`, `platform-portal`; cierre a 100%, rechazo de permisos y conservación de snapshot. |
| Guardado local, reapertura y sincronización por campo | `storage`, `offline-session`, `platform-sync`, `automatic-record-sync`; conserva campos ajenos y aplica el último guardado aceptado en el mismo campo. |
| Plan y monitoreo originales | `original-steps`, `review-draft`, `review-display`, `platform-sync`; conserva tablas, historial y campos anidados. |
| PDF, impresión, mapa y nombres | `chrome-report`, `chrome-render-smoke`, `report-layout`, `report-map`, `print-filename`, `platform-report-export`. |
| Archivos compartidos y reintentos | `shared-archive`, `drive-archive`; dos cuentas, creación concurrente, vencimiento, cierre, códigos y separación inicial/reevaluación. |
| Red y sesiones superpuestas | `platform-portal`; peticiones fallidas, recuperación automática, deduplicación y rechazo de respuestas de una cuenta anterior. |

Capturas de QA de esta revisión: `auditoria-coordinador-pc.png`, `auditoria-propietario-pc.png`, `auditoria-evaluador-movil.png`, `auditoria-fallo-red-movil.png` y `auditoria-red-recuperada-movil.png`. El control superior con prefijo QA solo existe en el servidor de pruebas y no se publica.

## Observaciones pendientes y límites

1. **Alerta confirmada de configuración de Supabase:** está desactivada la comprobación de contraseñas filtradas. No se modificó la configuración ni se contrató un servicio durante esta auditoría. Debe revisarse su disponibilidad en el plan del proyecto. [Guía de seguridad de contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
2. **Riesgo potencial de rendimiento:** el portal consulta los registros autorizados al actualizar las listas. Se evita duplicar cargas simultáneas y se indexan las evaluaciones en memoria por establecimiento, y después de esta auditoría se ejecutó una prueba aislada con 100 establecimientos y 50 evaluadores concurrentes, documentada en [PRUEBAS-DE-CARGA.md](PRUEBAS-DE-CARGA.md). La prueba encontró y corrigió sobrecarga en el cálculo y transporte de pendientes. Aún falta una prueba de infraestructura de staging equivalente a producción para garantizar capacidad. Conviene medir latencia, tamaño de respuesta y memoria móvil antes de ampliar a ese volumen; si lo requieren los resultados, limitar proyecciones y consultas por contexto.
3. **Causa concreta de la captura:** `Failed to fetch` significa que una petición no pudo completarse; la captura no contiene su URL ni trazas para atribuirla a la red móvil, un tiempo de espera o un proveedor. Se corrigieron y reprodujeron el manejo del fallo y la recuperación; no se inventa una causa externa específica.
4. **Cobertura del navegador:** PC y vista móvil de 390 px en el navegador integrado. No se ejecutó la prueba en el teléfono Android físico del usuario. Las pruebas automáticas cubren también IndexedDB, Service Worker y la lógica compartida de sincronización.
5. **Almacenamiento offline:** requiere haber abierto la evaluación antes, en el mismo navegador/dispositivo. Borrar los datos del navegador o perder el almacenamiento local elimina los cambios que aún no llegaron al servidor. La auditoría no puede garantizar una escritura que el sistema operativo interrumpa antes de confirmarse en IndexedDB.
6. **Alcance de seguridad:** revisión funcional/técnica, pruebas de autorización, dependencias y asesores de Supabase; no es una prueba de penetración exhaustiva ni una certificación de ausencia de vulnerabilidades. Las tablas privadas con RLS sin políticas son deliberadamente inaccesibles al cliente; no se abrieron permisos para silenciar ese aviso informativo.

Las pruebas con Google no modificaron el repositorio real del usuario. La limpieza de copias existentes ocurre tras una exportación real correcta, sobre los archivos identificados de la misma medición; primero se verifica la pareja y después se envían duplicados a la papelera.
