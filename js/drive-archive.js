(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WashArchive = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  async function api(body, request) {
    const response = await request('/api/drive-archive', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body), signal: AbortSignal.timeout(60000)});
    let result;
    try { result = await response.json(); } catch (_) { throw new Error('El repositorio central no está disponible.'); }
    if (!response.ok) throw new Error(result.error || 'No se pudo guardar en el repositorio.');
    return result;
  }
  async function upload(receipt, kind, blob, request, progress) {
    // El servidor consulta la sesión de Google y envía fragmentos menores de 1 MB.
    // El navegador no depende de las respuestas CORS de la API de subidas central.
    let result = await api({action: 'status', receipt, kind}, request);
    let previousOffset = -1;
    while (!result.id) {
      const start = result.offset;
      progress(`Guardando evaluación: ${Math.floor(start / blob.size * 100)}%…`);
      if (!Number.isSafeInteger(start) || start <= previousOffset || start < 0 || start >= blob.size) throw new Error('La subida no avanzó. Reintente el guardado.');
      previousOffset = start;
      const bytes = new Uint8Array(await blob.slice(start, Math.min(start + 1024 * 1024, blob.size)).arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      result = await api({action: 'upload', receipt, kind, offset: start, data: btoa(binary)}, request);
    }
    return result.id;
  }
  async function save(job, progress, request = fetch) {
    if (!job.session) job.session = await api({action: 'start', facility: job.dataset.generalInfo.facilityName, countryCode: job.dataset.generalInfo.countryCode, location: job.dataset.generalInfo.district, jsonBytes: job.json.size, pdfBytes: job.pdf.size}, request);
    job.ids ||= [null, null];
    for (let i = 0; i < 2; i++) {
      if (job.ids[i]) continue;
      progress('Guardando evaluación…');
      job.ids[i] = await upload(job.session.receipt, i ? 'pdf' : 'json', i ? job.pdf : job.json, request, progress);
    }
    progress('Confirmando guardado…');
    const result = await api({action: 'verify', receipt: job.session.receipt, ids: job.ids}, request);
    if (!result.saved) throw new Error('El repositorio no confirmó ambos archivos.');
    return result;
  }
  return {save};
});
