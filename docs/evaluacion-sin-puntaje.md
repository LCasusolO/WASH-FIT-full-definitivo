# Indicadores sin puntaje

En el paso 2 se puede avanzar cuando cada indicador visible tiene un puntaje (0, 1 o 2) o una explicación escrita en Comentarios de campo / Hallazgos. No se exige un prefijo. Se rechazan campos vacíos, espacios, solo símbolos o números y la declaración «No aplica» sin explicación. La aplicación comprueba la presencia de texto, no su corrección técnica.

No existe un selector adicional. Es suficiente seleccionar Cumple, Cumple Parcialmente o No Cumple, o escribir una explicación libre en el campo de hallazgos. Un texto libre permite avanzar sin clasificar automáticamente su significado. La explicación no asigna un puntaje.

Se conservan los cálculos y los estados de archivos anteriores: una clasificación «No se aplica» ya guardada, sin puntaje y con explicación, se excluye del total aplicable del dominio y del total general. Si se borra el motivo, vuelve a ser pendiente y entra nuevamente en el total. Al seleccionar un puntaje se limpia la clasificación anterior.

El cumplimiento usa puntos obtenidos / (2 × indicadores con puntaje). El general suma todos los puntos, sin promediar porcentajes de dominios. La cobertura y la barra existentes usan indicadores con puntaje / indicadores aplicables. «Sin información», sin clasificar y sin responder permanecen en el total aplicable y no cuentan como evaluados. Si no hay puntajes, se muestra «Sin indicadores evaluados».

No se cambian las reglas JMP: un indicador requerido sin puntaje sigue contando como 0, incluso si está justificado como no aplicable al cumplimiento general.

El campo opcional `assessmentStatus` admite `not_applicable`, `no_information` o cadena vacía. Se conserva junto con `notes` en borrador, respaldo, JSON, repositorio e historial. El PDF muestra el estado y los hallazgos. Los JSON anteriores conservan todas sus notas y pueden avanzar con una explicación; no se clasifican automáticamente por el texto. Estos estados se conservan por compatibilidad con los archivos anteriores; la interfaz ya no pide seleccionar una clasificación. Las nuevas explicaciones libres no se interpretan como una clasificación automática.

El botón «Siguiente Dominio» siempre exige completar o justificar todos los indicadores visibles del dominio actual, aunque el siguiente dominio ya esté completo. Las pestañas permiten regresar a un dominio ya completo incluso si el actual está pendiente; desde un dominio completo se puede ir a cualquier otro.
