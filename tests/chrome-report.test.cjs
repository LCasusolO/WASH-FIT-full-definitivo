const test = require('node:test');
const assert = require('node:assert/strict');
const {gzipSync} = require('node:zlib');
const {createHandler} = require('../api/chrome-report.js');
const html = '<!doctype html><html><body><div class="report-content">Hospital</div></body></html>';
const payload = {htmlGzip: gzipSync(html).toString('base64')};
async function run(handler, body = payload, origin = 'https://wash-fit-full.vercel.app', method = 'POST') {
  const result = {headers: {}, setHeader(k,v) {this.headers[k]=v;}, status(code) {this.code=code;return this;}, json(data) {this.data=data;}, end(data) {this.data=data;}};
  await handler({method, headers: {origin}, body}, result);
  return result;
}
test('Chrome endpoint validates method, origin and bounded compressed HTML before rendering', async () => {
  const handler = createHandler({renderPdf: async () => {throw Error('Must not render');}});
  assert.equal((await run(handler, payload, 'https://other.example')).code,403);
  assert.equal((await run(handler, payload, undefined, 'GET')).code,405);
  assert.equal((await run(handler, {htmlGzip:'broken'})).code,400);
  assert.equal((await run(handler, {htmlGzip:gzipSync('x'.repeat(41*1024*1024)).toString('base64')})).code,400);
});
test('Chrome endpoint returns the rendered PDF and exposes failure without a template fallback', async () => {
  const pdf = Buffer.from('%PDF-1.7 test');
  const result = await run(createHandler({renderPdf: async received => {assert.equal(received,html);return pdf;}}));
  assert.equal(result.code,200); assert.equal(result.headers['Content-Type'],'application/pdf'); assert.equal(result.data,pdf);
  assert.equal((await run(createHandler({renderPdf: async () => {throw Error('Chrome unavailable');}}))).code,502);
  assert.equal((await run(createHandler({renderPdf: async () => Buffer.alloc(4*1024*1024+1)}))).code,413);
});
