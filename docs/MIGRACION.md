# Crear el nuevo repositorio

## Archivos

1. Descomprima `WASH-FIT-definitivo.zip`.
2. Cree un repositorio vacío en GitHub con el nombre elegido.
3. Suba todo lo que hay dentro de `WASH-FIT-definitivo` a la raíz. Incluya archivos ocultos y `.github/workflows/checks.yml`.
4. No copie `.git`, `node_modules`, `dist`, `work`, archivos `.env` privados ni registros. El paquete ya excluye esos elementos.

Con Git, dentro de la carpeta extraída:

```sh
git init -b main
git add .
git commit -m "Consolidar WASH FIT v2.0"
git remote add origin https://github.com/TU-USUARIO/TU-NUEVO-REPOSITORIO.git
git push -u origin main
```

El paquete no contiene el historial anterior. La comparación histórica de una prueba se reemplazó por una fixture con los mismos fragmentos originales; `npm test` ya no requiere el commit `84a71ba`.

## Verificación local

Ejecute `npm ci --ignore-scripts`, `npm test` y `npm run build`. Use Node 22.17+ de la rama 22 o 24+. En Windows/macOS dos pruebas de Chrome se omiten si no se define `WASH_CHROME_EXECUTABLE`.

Para probar todas las pruebas en PowerShell con Chrome instalado:

```powershell
$env:WASH_CHROME_EXECUTABLE='C:/Program Files/Google/Chrome/Application/chrome.exe'
npm test
$env:WASH_APP_ORIGIN='http://127.0.0.1:8765'
npm run serve
```

La ruta puede variar por equipo. Las variables de un `.env` no se cargan automáticamente con el servidor local. Los registros de pruebas se guardan como evidencia en `docs/evidencia`.

## Despliegue

Vincule el nuevo repositorio a un proyecto Vercel, seleccione una versión Node compatible y conserve `vercel.json`. Configuración: instalar `npm ci --ignore-scripts`, construir `npm run build`, publicar `dist`. Las funciones `api` requieren el runtime del servidor y el binario de Chromium incluido; publicar solo `dist` en un servidor estático deja sin PDF de servidor y Drive.

Configure `WASH_APP_ORIGIN` con el origen HTTPS exacto, sin ruta ni barra final, y `GOOGLE_DRIVE_FOLDER_ID` con la carpeta elegida. Para Drive añada también las tres credenciales OAuth. Son variables privadas de servidor; nunca deben ir en GitHub ni en `js/`.

El código conserva como respaldo el dominio y carpeta antiguos. No omita las variables explícitas en el nuevo proyecto. Un único valor de origen se admite por entorno: si la URL de Preview cambia, ajuste ese valor para poder probar sus API.

Vuelva a desplegar después de cambiar variables. Compruebe la web, exportación JSON, impresión y PDF del servidor. Para Drive, confirme que existen JSON y PDF reales, vuelva a exportar y compruebe que se actualizan sus IDs. Esta entrega no ha usado ni trasladado credenciales privadas.

## Evaluaciones existentes

Antes de cambiar de URL, cada usuario debe exportar su JSON desde la web antigua. La descarga JSON ocurre antes de intentar Drive, por lo que un fallo posterior de archivado no invalida esa descarga. Conserve el archivo y, si es necesario, imprima su reporte.

En la web nueva importe el JSON, revise establecimiento, nivel, saneamiento, puntajes, notas, fotos, responsables e historial; recargue para confirmar persistencia. IndexedDB, caché, borrador, respaldo y registro del último archivo confirmado pertenecen al origen anterior y no se trasladan con el código. No elimine la web antigua antes de completar este paso.

Los documentos ya guardados en Drive permanecen en su carpeta. Cambiar de carpeta no los copia. Usar la misma carpeta y el mismo nombre normalizado puede actualizar los mismos archivos; use otra carpeta si necesita separar ambos proyectos. El par JSON/PDF se sube en dos operaciones: no es una transacción atómica de Google Drive.

## Pendientes del propietario

Defina la licencia general antes de autorizar reutilización por terceros. Confirme el uso de logos y la validación metodológica del catálogo. Mantenga una exportación de evaluaciones como respaldo: un repositorio Git de código no es una copia de los datos de los usuarios.
