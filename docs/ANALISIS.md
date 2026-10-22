# Análisis del repositorio y selección final

Revisión del 22 de octubre de 2026. Fuente: [WASH-FIT-full](https://github.com/LCasusolO/WASH-FIT-full/tree/a58247f7e585444f8dfa2169edef971f15a6cbf9), rama `main`, commit `a58247f7e585444f8dfa2169edef971f15a6cbf9`. Se revisaron el árbol actual completo (66 archivos), referencias e historial Git, ramas, solicitudes de integración, configuración, catálogo, pruebas, cliente y servidor. Los recursos binarios y bibliotecas vendorizadas se revisaron por uso, empaquetado, versiones y avisos, sin una auditoría línea por línea de código de terceros.

## Qué versión conservar

Hay 50 ramas remotas; todas sus puntas están alcanzadas por `main`. Las 49 solicitudes de integración consultadas están fusionadas; no había incidencias abiertas ni releases publicadas. Git contiene 132 commits y no muestra tags. No es necesario mezclar archivos de distintas ramas: hacerlo podría restablecer comportamientos antiguos. La base elegida es la instantánea indicada, con preparación de portabilidad y documentación descrita en `PROCEDENCIA.md`.

No se encontraron Word, PDF, Excel ni especificaciones originales del instrumento en el árbol actual. El «Excel final» se menciona en el historial, pero el archivo mantenido por esta versión es `js/data/indicators.js`. Esta entrega incluye los archivos reales de la aplicación y documentos técnicos Markdown; no inventa originales faltantes ni declara haber contrastado el catálogo con un Excel no disponible.

## Resultado técnico

La versión base instala dependencias, supera 91 pruebas con Chrome local y construye `dist`. La lógica cubre importación/migración JSON, almacenamiento, reglas JMP, aplicabilidad, navegación, riesgos, revisiones, impresión y protocolos de Drive. Hay pruebas con dependencias simuladas y pruebas reales de generación PDF; no toda la cobertura representa navegación real.

El producto puede mantenerse como una sola aplicación Vue con dos funciones Node. Conservar `package-lock.json`, API, scripts, pruebas y recursos locales es necesario: copiar únicamente `index.html` o `dist` no reproduce la funcionalidad completa. No hay un backend de usuarios ni sincronización de borradores entre dispositivos.

## Hallazgos y decisiones

| Prioridad | Hallazgo verificable | Tratamiento en la entrega |
| --- | --- | --- |
| Alta para migrar | `tests/core.test.cjs` ejecutaba `git show 84a71ba:js/app.js`; fallaría en un repositorio sin ese historial. | Resuelto con fixture de los mismos tres fragmentos y procedencia del commit original. Se conserva la comparación. |
| Alta para instalar | README decía Node 20+, pero Chromium instalado exige `^22.17.0 || >=24.0.0`. | README, `engines`, lockfile y `.nvmrc` alineados. |
| Alta para operar | Nuevo origen/carpeta no se heredan con el repositorio; hay fallbacks al proyecto antiguo en las API. | Plantilla `.env.example` neutra y guía que exige configurar valores explícitos. Código funcional conservado. |
| Media | Documentación de Drive describía copias nuevas, PDF sin mosaicos y generador anterior; código actual reemplaza por nombre y usa Chrome con imágenes incorporadas. | Documento reescrito conforme a las rutas activas. |
| Media | README prometía responsables vinculados por ID; `applyDataset` los transforma en texto y limpia el ID. | Documentación corregida, comportamiento conservado. |
| Baja | pdfmake, sus fuentes y logo no utilizado aumentaban el árbol sin estar en el despliegue activo. | Se excluyen cuatro archivos, con registro en inventario. |
| Baja | `js/pdf-report.js` parece obsoleto para producción, pero cuatro archivos de pruebas lo importan. | Se conserva y se identifica como compatibilidad de pruebas. |

## Límites y puntos que siguen abiertos

1. **Drive real:** no se probaron credenciales privadas ni escrituras en una carpeta real. La instalación del código no activa automáticamente el servicio. JSON y PDF se actualizan por separado: un fallo intermedio puede dejar temporalmente versiones distintas.
2. **Clave por nombre:** dos evaluaciones con igual país y nombre normalizado pueden reemplazar los mismos archivos. Hay riesgo de colisión y de sobrescritura entre visitantes; el código carece de identidad única persistente para cada evaluación en Drive.
3. **Servicio público:** el origen permitido no es autenticación ni limita cuotas por usuario. Se conserva el diseño público autorizado en el historial; credenciales y políticas de acceso deben configurarse para el público real del nuevo sitio.
4. **Coherencia de captura:** JSON se toma antes de varias esperas de renderizado; el HTML se construye desde la interfaz reactiva. No hay un bloqueo general de edición durante toda la preparación. No se validó la coincidencia del par si el usuario edita justo en ese intervalo; conviene evitar editar hasta terminar la preparación.
5. **Persistencia:** un borrador y un respaldo por navegador/origen; no hay control de conflictos entre pestañas. La limpieza del navegador o cambio de dominio no conserva automáticamente datos. Los reintentos de Drive pendientes viven en memoria.
6. **Metodología:** JMP utiliza equivalencias particulares y vacíos como 0; el cumplimiento usa solo respondidos. Son decisiones explícitas del producto, no validación del instrumento oficial. Las notas libres habilitan avance por presencia de texto, no por calidad técnica.
7. **Publicación:** no se creó repositorio remoto ni se desplegó. Se validó localmente con Node 24.13.1 y Chrome Windows; no se ejecutó aquí el binario Chromium empaquetado de Linux ni una función Vercel real. El workflow conserva la prueba Linux para cuando se publique.
8. **Interfaz y PDF:** las pruebas reales locales se detallan en `VALIDACION.md`. No se declara revisión exhaustiva de todos los formularios, tamaños, fotos máximas, historiales extensos, Safari o iPhone físico.
9. **Mantenimiento:** `app.js` e `index.html` concentran mucha lógica; la refactorización sería un trabajo posterior. El build no limpia `dist` previo; el servidor local no carga `.env`. Mantener un checkout de construcción limpio evita residuos.
10. **Derechos:** no existe licencia general del proyecto. Se conservan avisos de bibliotecas; no se añadió una licencia inventada ni se certificó uso institucional de los logos.

## Qué recibe el nuevo repositorio

Fuentes actuales, dependencias fijadas, recursos activos y licencias, API, workflow, pruebas portables y documentación consolidada. Se excluyen historial Git, dependencias instaladas, salidas de construcción, temporales, secretos y los cuatro recursos sin uso registrados. `INVENTARIO.csv` permite comprobar cada decisión y huella SHA-256. `evidencia/github-review.json` documenta ramas y solicitudes consultadas.
