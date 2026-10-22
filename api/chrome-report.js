const {gunzipSync} = require('node:zlib');
const MAX_BODY = 4 * 1024 * 1024;
const MAX_HTML = 40 * 1024 * 1024;
const {mkdtemp, rm} = require('node:fs/promises');
const {tmpdir} = require('node:os');
const {join} = require('node:path');
let renderQueue = Promise.resolve();
// Vercel puede atender varias solicitudes en la misma instancia y disco temporal.
function render(html, env = process.env) {
  const result = renderQueue.then(() => renderOne(html, env));
  renderQueue = result.catch(() => {});
  return result;
}
async function renderOne(html, env) {
  const {chromium: playwright} = require('playwright-core');
  let executablePath = env.WASH_CHROME_EXECUTABLE, args = [];
  if (!executablePath) {
    const {default: chromium} = await import('@sparticuz/chromium');
    // La ubicación de import.meta.url cambia cuando Vercel empaqueta el módulo.
    chromium.setGraphicsMode = false;
    const bin = join(process.cwd(), 'node_modules', '@sparticuz', 'chromium', 'bin');
    executablePath = await chromium.executablePath(bin);
    args = chromium.args.filter(arg => !arg.startsWith('--disk-cache-size='));
  }
  const scratch = await mkdtemp(join(tmpdir(), 'wash-report-'));
  let context;
  try {
    context = await playwright.launchPersistentContext(join(scratch, 'profile'), {
      executablePath, args: [...args, '--disable-gpu', '--disk-cache-size=1', '--media-cache-size=1'],
      artifactsDir: join(scratch, 'artifacts'), downloadsPath: join(scratch, 'downloads'),
      headless: true, javaScriptEnabled: false, viewport: {width: 1123, height: 794}, serviceWorkers: 'block'
    });
    // The report is self-contained. Block all network/file requests, including CSS URLs.
    await context.route('**/*', route => route.abort());
    const page = context.pages()[0] || await context.newPage();
    page.setDefaultTimeout(30000);
    await page.emulateMedia({media: 'print'});
    await page.setContent(html.replace(/<head>/i, `<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:">`), {waitUntil: 'load'});
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images, image => image.decode()));
    });
    return await page.pdf({format: 'A4', landscape: true, preferCSSPageSize: true, printBackground: true, timeout: 30000});
  } finally {
    try { await context?.close(); }
    finally { await rm(scratch, {recursive: true, force: true, maxRetries: 3}); }
  }
}
function createHandler({env = process.env, renderPdf = html => render(html, env)} = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({error: 'Método no permitido.'});
    if (req.headers.origin !== (env.WASH_APP_ORIGIN || 'https://wash-fit-full.vercel.app')) return res.status(403).json({error: 'Origen no permitido.'});
    let html;
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!body || typeof body.htmlGzip !== 'string' || JSON.stringify(body).length > MAX_BODY) throw Error();
      html = gunzipSync(Buffer.from(body.htmlGzip, 'base64'), {maxOutputLength: MAX_HTML}).toString('utf8');
      if (!html.startsWith('<!doctype html>') || !html.includes('report-content')) throw Error();
    } catch (_) { return res.status(400).json({error: 'El reporte enviado no es válido o supera el tamaño permitido.'}); }
    try {
      const pdf = await renderPdf(html);
      if (pdf.length > 4 * 1024 * 1024) return res.status(413).json({error: 'El PDF supera el tamaño permitido. Reduzca el tamaño de las fotografías y reintente.'});
      res.setHeader('Content-Type', 'application/pdf');
      return res.status(200).end(pdf);
    } catch (error) {
      console.error('Chrome PDF generation failed:', error.message);
      const message = error.message || '';
      const code = /input directory|does not exist/.test(message) ? 'CHROME_BINARY_PATH' : /shared librar|lib[^ ]+\.so/.test(message) ? 'CHROME_LIBRARY_MISSING' : /launch|browser has been closed/.test(message) ? 'CHROME_LAUNCH_FAILED' : error.code || 'CHROME_RENDER_FAILED';
      return res.status(502).json({error: 'No se pudo generar el PDF con Chrome. Reintente el guardado.', code});
    }
  };
}
module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports.render = render;
