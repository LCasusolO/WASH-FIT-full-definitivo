# Reglas funcionales conservadas

Estas reglas describen el código de la entrega. No constituyen validación sanitaria independiente ni certificación OPS/OMS.

## Evaluación y aplicabilidad

Siete dominios: Agua, Saneamiento, Gestión de Residuos, Higiene de Manos, Limpieza Hospitalaria, Energía, Gestión y Administración. Puntajes: 2 Cumple, 1 Cumple Parcialmente, 0 No Cumple.

El catálogo tiene 100 filas; `S_8` es una instrucción oculta y no se puntúa. `A_1a` corresponde a atención primaria y `A_1b` a hospitales. `A_16`, `RES_16`, `RES_17`, `L_13`, `L_15`, `L_16` y `M_11` se muestran en segundo/tercer nivel. Alcantarillado muestra `S_9a` y `S_10a`; in situ muestra `S_8b`, `S_9b` y `S_10b`. `S_13` depende de `S_11 = 1 o 2`.

Se puede avanzar si cada indicador visible del dominio actual tiene puntaje o explicación con texto en hallazgos. «No aplica» solo, espacios, números y símbolos no bastan. No existe selector adicional. La validación detecta presencia de texto, no su justificación técnica. Siguiente siempre valida el dominio actual; las pestañas permiten volver a uno completo desde otro pendiente. Esta condición no es una certificación de que toda la evaluación esté completa.

Un estado `assessmentStatus=not_applicable` heredado, sin puntaje y con explicación, se excluye del total aplicable. Una explicación nueva libre no asigna automáticamente ese estado. `no_information` y respuestas pendientes permanecen en el total. Consulte `evaluacion-sin-puntaje.md`.

## Cumplimiento

Cumplimiento = suma de puntajes visibles respondidos / (2 × cantidad de indicadores visibles con puntaje), redondeado a entero. El general suma puntos y denominadores; no promedia porcentajes de dominios. Cobertura = indicadores con puntaje / total visible aplicable.

Sin respuestas se muestra Sin indicadores evaluados. Con respuestas: más de 75% Mejora Avanzada; de 60% a 75% En Proceso de Mejora; menos de 60% Requiere Mejoras Prioritarias. Un cumplimiento alto con poca cobertura no significa evaluación completa.

## Adaptación JMP implementada

Para JMP solamente, respuestas vacías se consideran 0, incluso con justificación. Los valores guardados no cambian. Los campos antiguos de observación de agua y tratamiento seguro no reemplazan puntajes.

| Servicio | Indicadores | Regla |
| --- | --- | --- |
| Agua | `A_1a` o `A_1b`, y `A_3` | Fuente 0: Sin Servicio. Fuente ≥1 y disponibilidad ≥1: Básico. Otra combinación: Limitado. |
| Saneamiento | `S_1`, `S_2`, `S_4`, `S_5`, `S_6`, `S_7` | S_1 o S_2 en 0: Sin Servicio. Todos ≥1: Básico. Restantes: Limitado. |
| Residuos | `RES_2` y tratamiento | Ambos ≥1: Básico. Ambos 0: Sin Servicio. Otro: Limitado. |
| Higiene | `H_1` y `S_3` | Ambos ≥1: Básico. Ambos 0: Sin Servicio. Otro: Limitado. |
| Limpieza | `L_1` y `L_5` | L_1 ≥1 y L_5=2: Básico. Ambos 0: Sin Servicio. Otro: Limitado. |

Residuos usa `RES_10` en tratamiento local o `RES_12` en externo si existe ruta explícita. Sin esa ruta utiliza los tratamientos respondidos y el menor cuando hay dos. Sin ninguno usa 0. No se ha cambiado esta adaptación aprobada en el repositorio original.

## Riesgos, plan y revisión

Riesgo = gravedad + probabilidad; cada entrada es entera de 0 a 10. Total 0–7 Bajo, 8–14 Medio, 15–20 Alto; sin ambos componentes no hay total. Se conserva la suma y las condiciones existentes de filtros y reinicio.

El plan registra acciones, recursos, responsables, costos y plazos. La aplicación actual trata el responsable como texto independiente y convierte vinculaciones antiguas al importar; los helpers de compatibilidad conservan ID y nombre. No debe prometerse vinculación automática al renombrar integrantes.

Una revisión agrega una instantánea al historial y no modifica el plan ni revisiones previas. Permite texto nuevo acumulado y distingue cambios de responsable y novedades. Máximo 200 por indicador. Los plazos vencidos se consideran retrasados salvo estado Completado. Desmarcar una respuesta limpia campos de riesgo/plan; reiniciar un dominio borra campos editables pero conserva el historial existente. Exporte respaldo antes de esas operaciones.

## Archivos

JSON y PDF usan nombre base país-establecimiento normalizado, sin tildes y con guiones bajos; un país desconocido usa `SIN`. En Drive se busca por carpeta, nombre y MIME: se actualiza el ID existente más antiguo o se crea si no existe. No se borran duplicados anteriores. Dos establecimientos con el mismo nombre normalizado y país comparten destino; esta clave no es un identificador único de evaluación.


## Reglas del espacio de trabajo colaborativo

1. El propietario tiene alcance global; el administrador nacional, su país.
2. El coordinador es responsable del equipo evaluador, no un rol adicional del establecimiento.
3. Cada evaluación integral corresponde a un establecimiento y equipo asignado.
4. El paso 5 agrega monitoreos fechados; no modifica las puntuaciones iniciales.
5. Validar una medición conserva su versión y el plan de ese momento, sin cerrar
   el proceso continuo de mejora del establecimiento.
6. La reevaluación integral es otra medición relacionada y comienza sin respuestas copiadas.
7. Los cambios de participantes no reescriben las versiones validadas.
8. Un conflicto exige decisión explícita; refrescar la página no lo resuelve automáticamente.
9. Retirar un usuario revoca acceso; el historial mantiene su autoría.
10. Países, establecimientos y equipos tienen identificadores estables; los
    archivos de Drive se vinculan a exportaciones, no solo a nombres.
