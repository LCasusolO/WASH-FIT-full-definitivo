(function (root) {
  'use strict';
  async function serialize(element, title) {
    await document.fonts.ready;
    const copy = element.cloneNode(true);
    copy.querySelectorAll('.no-print, script, iframe, object, embed').forEach(node => node.remove());
    const originals = Array.from(element.querySelectorAll('img'));
    const images = Array.from(copy.querySelectorAll('img'));
    await Promise.all(images.map(async (image, index) => {
      const source = originals[index];
      // Los mosaicos del mapa son opcionales; una descarga fallida no debe bloquear el reporte.
      if (image.classList.contains('leaflet-tile') && (!source.complete || !source.naturalWidth)) { image.remove(); return; }
      try {
        await source.decode();
        const canvas = document.createElement('canvas');
        canvas.width = source.naturalWidth; canvas.height = source.naturalHeight;
        canvas.getContext('2d').drawImage(source, 0, 0);
        image.src = canvas.toDataURL('image/png');
        image.removeAttribute('srcset');
        // Leaflet fades new tiles with JS. The static report must keep every decoded tile visible.
        if (image.classList.contains('leaflet-tile')) { image.style.opacity = '1'; image.classList.add('leaflet-tile-loaded'); }
      } catch (_) {
        if (image.classList.contains('leaflet-tile')) { image.remove(); return; }
        throw new Error('No se pudo cargar una imagen del reporte. Revise la conexión y reintente.');
      }
    }));
    const css = Array.from(document.styleSheets).map(sheet => Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n')).join('\n');
    const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    return '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>' + escape(title) + '</title><style>' + css.replace(/<\/style/gi, '<\\/style') + '</style></head><body class="font-sans antialiased"><section class="print-report report-open">' + copy.outerHTML + '</section></body></html>';
  }
  async function generate(element, title) {
    const html = typeof element === 'string' ? element : await serialize(element, title);
    const compressed = new Uint8Array(await new Response(new Blob([html]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < compressed.length; offset += 32768) binary += String.fromCharCode(...compressed.subarray(offset, offset + 32768));
    const body = JSON.stringify({htmlGzip: btoa(binary)});
    if (new Blob([body]).size > 4 * 1024 * 1024) throw new Error('El reporte supera el tamaño permitido. Reduzca el tamaño de las fotografías y reintente.');
    const response = await fetch('/api/chrome-report', {method: 'POST', headers: {'Content-Type': 'application/json'}, body, signal: AbortSignal.timeout(90000)});
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || 'No se pudo generar el PDF con Chrome. Reintente el guardado.');
    }
    if (!response.headers.get('content-type')?.includes('application/pdf')) throw new Error('El servidor no devolvió un PDF válido.');
    return response.blob();
  }
  function preparePrint() {
    try {
      const popup = window.open('', '_blank');
      if (popup) { popup.document.title = 'Preparando reporte'; popup.document.body.textContent = 'Preparando reporte para imprimir…'; }
      return popup;
    } catch (_) { return null; }
  }
  async function print(html, title, popup) {
    if (popup && !popup.closed) {
      try {
        popup.document.open();
        const loaded = new Promise(resolve => popup.addEventListener('load', resolve, {once: true}));
        popup.document.write(html);
        popup.document.close();
        await loaded;
        await popup.document.fonts.ready;
        await Promise.all(Array.from(popup.document.images, image => image.decode()));
        popup.document.title = title || popup.document.title;
        popup.addEventListener('afterprint', () => popup.close(), {once: true});
        popup.focus();
        popup.print();
        return;
      } catch (error) { popup.close(); throw error; }
    }
    const originalTitle = document.title;
    let printTitle;
    const frame = document.createElement('iframe');
    frame.className = 'no-print';
    frame.title = 'Impresión del reporte';
    frame.style.cssText = 'position:fixed;left:-2000px;top:0;width:1123px;height:794px;border:0';
    const loaded = new Promise(resolve => { frame.onload = resolve; });
    frame.srcdoc = html;
    document.body.appendChild(frame);
    const cleanup = () => {
      if (document.title === printTitle) document.title = originalTitle;
      frame.remove();
    };
    try {
      await loaded;
      await frame.contentDocument.fonts.ready;
      await Promise.all(Array.from(frame.contentDocument.images, image => image.decode()));
      printTitle = title || frame.contentDocument.title || originalTitle;
      // Chrome puede proponer el título principal al guardar un reporte desde un iframe.
      document.title = printTitle;
      frame.contentDocument.title = printTitle;
      frame.title = printTitle;
      frame.contentWindow.addEventListener('afterprint', cleanup, {once: true});
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch (error) { cleanup(); throw error; }
  }
  root.WashChrome = {serialize, generate, preparePrint, print};
})(window);
