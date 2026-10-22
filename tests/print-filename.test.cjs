const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../js/core.js');

function fixture({ fail = false } = {}) {
  const events = {};
  const document = { title: 'WASH FIT - OPS' };
  let removed = false, atPrint;
  const frame = {
    style: {}, contentDocument: { title: 'Serialized title', fonts: { ready: Promise.resolve() }, images: [] },
    contentWindow: {
      addEventListener(name, fn) { events[name] = fn; }, focus() {},
      print() { atPrint = { parent: document.title, frame: frame.contentDocument.title }; if (fail) throw new Error('Print failed'); }
    }, remove() { removed = true; }
  };
  document.createElement = () => frame;
  document.body = { appendChild: () => frame.onload() };
  const context = vm.createContext({ window: {}, document });
  vm.runInContext(fs.readFileSync('js/chrome-report.js', 'utf8'), context);
  return { api: context.window.WashChrome, document, events, get removed() { return removed; }, get atPrint() { return atPrint; } };
}

test('printing proposes the same basename as JSON export and restores the app title afterward', async () => {
  for (const info of [{ countryCode: 'PER', facilityName: 'Hospital dos de mayo' }, { countryCode: 'BOL', facilityName: 'Hospital internacional' }, { facilityName: '' }]) {
    const app = fixture(), base = Core.fileBaseName(info);
    await app.api.print('<html></html>', base);
    assert.deepEqual(app.atPrint, { parent: base, frame: base });
    assert.equal(app.removed, false);
    app.events.afterprint();
    assert.equal(app.document.title, 'WASH FIT - OPS');
    assert.equal(app.removed, true);
  }
});

test('a print failure restores the title and removes the print frame', async () => {
  const app = fixture({ fail: true });
  await assert.rejects(app.api.print('<html></html>', 'PER-Hospital'), /Print failed/);
  assert.equal(app.document.title, 'WASH FIT - OPS');
  assert.equal(app.removed, true);
});

test('a window reserved by the click prints the report and closes after the dialog finishes', async () => {
  const events = {}; let printedTitle, closed = false;
  const popup = {
    closed: false, document: { title: '', body: {}, fonts: {ready:Promise.resolve()}, images: [], open(){}, write(){}, close(){events.load();} },
    addEventListener: (name, fn) => {events[name]=fn;}, focus(){}, print(){printedTitle=this.document.title;}, close(){closed=true;}
  };
  const context=vm.createContext({window:{open:()=>popup},document:{}});
  vm.runInContext(fs.readFileSync('js/chrome-report.js','utf8'),context);
  const prepared=context.window.WashChrome.preparePrint();assert.equal(prepared,popup);
  await context.window.WashChrome.print('<html>Report</html>','BOL-Hospital_internacional',prepared);
  assert.equal(printedTitle,'BOL-Hospital_internacional');assert.equal(closed,false);
  events.afterprint();assert.equal(closed,true);
});
