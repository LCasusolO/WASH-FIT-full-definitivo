const Core = require('../js/core.js');
const crypto = require('node:crypto');
const FOLDER = '1SjIXFiCnnQwTZTTvCqLY6xJYb9sGxb6z';
const MAX_BYTES = 40 * 1024 * 1024;
function createHandler({env = process.env, request = fetch, now = Date.now} = {}) {
  let cachedToken;
  const call = (url, options) => request(url, {...options, signal: AbortSignal.timeout(20000)});
  const sign = body => crypto.createHmac('sha256', env.GOOGLE_CLIENT_SECRET).update(body).digest('base64url');
  async function token() {
    if (cachedToken?.expires > now()) return cachedToken.value;
    const result = await call('https://oauth2.googleapis.com/token', {method: 'POST', body: new URLSearchParams({client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: env.GOOGLE_REFRESH_TOKEN, grant_type: 'refresh_token'})});
    const data = await result.json();
    if (!result.ok || !data.access_token) {
      const expired = data.error === 'invalid_grant';
      throw Object.assign(new Error(expired ? 'La autorización de Google Drive venció o fue revocada. El administrador debe renovar la conexión del repositorio.' : 'No se pudo autorizar Google Drive. El administrador debe revisar la configuración del repositorio.'), {code: expired ? 'GOOGLE_AUTH_REQUIRED' : 'GOOGLE_AUTH_CONFIGURATION'});
    }
    cachedToken = {value: data.access_token, expires: now() + Math.max(0, Number(data.expires_in) - 60) * 1000};
    return cachedToken.value;
  }
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({error: 'Método no permitido.'});
    if (![env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REFRESH_TOKEN].every(Boolean)) return res.status(503).json({error: 'El repositorio aún no está activado. Comuníquese con el administrador.'});
    const allowedOrigin = env.WASH_APP_ORIGIN || 'https://wash-fit-full.vercel.app';
    if (req.headers.origin !== allowedOrigin) return res.status(403).json({error: 'Origen no permitido.'});
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!body || JSON.stringify(body).length > 2 * 1024 * 1024) return res.status(400).json({error: 'Solicitud inválida.'});
      const folder = env.GOOGLE_DRIVE_FOLDER_ID || FOLDER;
      if (body.action === 'health') {
        const response = await call(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folder)}?supportsAllDrives=true&fields=id,mimeType,trashed,capabilities(canAddChildren)`, {headers: {Authorization: 'Bearer ' + await token()}});
        const metadata = await response.json();
        if (!response.ok || metadata.trashed || metadata.mimeType !== 'application/vnd.google-apps.folder' || metadata.capabilities?.canAddChildren === false) throw Object.assign(new Error('La carpeta del repositorio no está disponible o la cuenta autorizada no puede guardar en ella.'), {code: 'GOOGLE_FOLDER_ACCESS'});
        return res.status(200).json({ready: true});
      }
      if (body.action === 'start') {
        if (![body.jsonBytes, body.pdfBytes].every(x => Number.isSafeInteger(x) && x > 0 && x <= MAX_BYTES) || typeof body.facility !== 'string' || body.facility.length > 500) return res.status(400).json({error: 'Nombre o tamaño de archivos inválido (máximo 40 MB por archivo).'});
        const authorization = 'Bearer ' + await token();
        const batch = crypto.randomUUID();
        const name = Core.fileBaseName({facilityName: body.facility, countryCode: body.countryCode, district: body.location});
        const files = [{kind: 'json', name: name + '.json', mime: 'application/json', bytes: body.jsonBytes}, {kind: 'pdf', name: name + '.pdf', mime: 'application/pdf', bytes: body.pdfBytes}];
        for (const file of files) {
          // Reuse an existing file ID for the same country/facility name.
          const quote = value => String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
          const query = new URLSearchParams({q: "'" + quote(folder) + "' in parents and trashed = false and name = '" + quote(file.name) + "' and mimeType = '" + file.mime + "'", fields: 'files(id),incompleteSearch', pageSize: '1', orderBy: 'createdTime', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true'});
          const listed = await call('https://www.googleapis.com/drive/v3/files?' + query, {headers: {Authorization: authorization}});
          const matches = await listed.json();
          if (!listed.ok || !Array.isArray(matches.files) || matches.incompleteSearch) throw new Error('No se pudo comprobar la copia anterior.');
          file.targetId = matches.files[0]?.id;
          const metadata = {name: file.name, mimeType: file.mime, appProperties: {washFitBatch: batch}};
          if (!file.targetId) metadata.parents = [folder];
          const endpoint = 'https://www.googleapis.com/upload/drive/v3/files' + (file.targetId ? '/' + encodeURIComponent(file.targetId) : '') + '?uploadType=resumable&supportsAllDrives=true&fields=id';
          const response = await call(endpoint, {method: file.targetId ? 'PATCH' : 'POST', headers: {Authorization: authorization, 'Content-Type': 'application/json', 'X-Upload-Content-Type': file.mime, 'X-Upload-Content-Length': String(file.bytes)}, body: JSON.stringify(metadata)});
          const session = response.headers.get('location');
          if (!response.ok || !session || new URL(session).origin !== 'https://www.googleapis.com') throw new Error('No se pudo iniciar la subida. Revise el acceso del propietario a la carpeta.');
          file.session = session;
        }
        const receiptBody = Buffer.from(JSON.stringify({batch, expires: now() + 3600000, files})).toString('base64url');
        return res.status(200).json({receipt: receiptBody + '.' + sign(receiptBody)});
      }
      if (['verify', 'status', 'upload'].includes(body.action)) {
        const [payload, signature] = String(body.receipt || '').split('.');
        const expected = Buffer.from(sign(payload || ''));
        const received = Buffer.from(signature || '');
        if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return res.status(400).json({error: 'Comprobante inválido.'});
        const receipt = JSON.parse(Buffer.from(payload, 'base64url').toString());
        if (receipt.expires < now()) return res.status(400).json({error: 'Comprobante vencido. Vuelva a Exportar.'});
        const authorization = 'Bearer ' + await token();
        if (body.action !== 'verify') {
          const file = receipt.files.find(file => file.kind === body.kind);
          if (!file?.session || new URL(file.session).origin !== 'https://www.googleapis.com') return res.status(400).json({error: 'Archivo inválido.'});
          const headers = {Authorization: authorization, 'Content-Type': file.mime};
          let chunk;
          if (body.action === 'upload') {
            if (typeof body.data !== 'string' || body.data.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(body.data)) return res.status(400).json({error: 'Fragmento inválido.'});
            chunk = Buffer.from(body.data, 'base64');
            if (chunk.toString('base64') !== body.data) return res.status(400).json({error: 'Fragmento inválido.'});
            if (!Number.isSafeInteger(body.offset) || body.offset < 0 || !chunk.length || chunk.length > 1024 * 1024 || body.offset + chunk.length > file.bytes || (body.offset + chunk.length !== file.bytes && chunk.length % (256 * 1024))) return res.status(400).json({error: 'Tamaño o posición de fragmento inválido.'});
            headers['Content-Range'] = `bytes ${body.offset}-${body.offset + chunk.length - 1}/${file.bytes}`;
          } else headers['Content-Range'] = `bytes */${file.bytes}`;
          const response = await call(file.session, {method: 'PUT', headers, ...(chunk ? {body: chunk} : {})});
          if (response.status === 308) {
            const range = response.headers.get('range');
            return res.status(200).json({offset: range ? Number(range.split('-')[1]) + 1 : 0});
          }
          if (!response.ok) throw new Error('Subida interrumpida.');
          const result = await response.json();
          if (!result.id) throw new Error('El repositorio no confirmó el archivo.');
          return res.status(200).json({id: result.id});
        }
        if (!Array.isArray(body.ids) || body.ids.length !== 2 || body.ids.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9_-]{5,200}$/.test(id))) return res.status(400).json({error: 'Archivos inválidos.'});
        for (let i = 0; i < 2; i++) {
          const response = await call(`https://www.googleapis.com/drive/v3/files/${body.ids[i]}?supportsAllDrives=true&fields=id,name,mimeType,size,parents,appProperties,trashed`, {headers: {Authorization: authorization}});
          const file = await response.json();
          const wanted = receipt.files[i];
          if ((wanted.targetId && body.ids[i] !== wanted.targetId) || !response.ok || file.trashed || !file.parents?.includes(folder) || file.appProperties?.washFitBatch !== receipt.batch || file.name !== wanted.name || file.mimeType !== wanted.mime || Number(file.size) !== wanted.bytes) throw new Error('No se pudo confirmar el guardado de ambos archivos en la carpeta.');
        }
        return res.status(200).json({saved: true, savedAt: new Date(now()).toISOString(), files: receipt.files.map((file, i) => ({id: body.ids[i], name: file.name, url: `https://drive.google.com/file/d/${body.ids[i]}/view`}))});
      }
      return res.status(400).json({error: 'Acción no válida.'});
    } catch (error) {
      if (['GOOGLE_AUTH_REQUIRED', 'GOOGLE_AUTH_CONFIGURATION', 'GOOGLE_FOLDER_ACCESS'].includes(error.code)) return res.status(502).json({error: error.message, code: error.code});
      return res.status(502).json({error: 'No se pudo completar el guardado en el repositorio. Revise la conexión y la configuración del repositorio.'});
    }
  };
}
module.exports = createHandler();
module.exports.createHandler = createHandler;
