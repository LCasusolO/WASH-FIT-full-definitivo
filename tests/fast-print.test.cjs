const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; }
const flush = () => new Promise(resolve => setImmediate(resolve));
function load({ serialize, generate, print, save } = {}) {
  let app; const calls = { serialized:0, generated:[], printed:[], saved:[], downloads:0 };
  const context = vm.createContext({
    Vue: {ref:value=>({value}),computed:getter=>({get value(){return getter();}}),watch(){},onMounted(){},nextTick:async cb=>cb?.(),createApp:options=>({mount(){app=options.setup();}})},
    window:{innerWidth:1200},navigator:{onLine:true},document:{querySelector:()=>({}),createElement:()=>({click(){calls.downloads++;},remove(){}}),body:{appendChild(){}}},
    URL:{createObjectURL:()=> 'blob:fixture',revokeObjectURL(){}},
    WashStorage:{createStore:()=>({write:async()=>{}})},
    WashChrome:{serialize:async(...args)=>{calls.serialized++;return serialize?serialize(...args):'<html>Snapshot</html>';},generate:async html=>{calls.generated.push(html);return generate?generate(html):new Blob(['pdf']);},print:async(...args)=>{calls.printed.push(args);return print?.(...args);}},
    WashArchive:{save:async job=>{calls.saved.push(job);return save?save(job):{savedAt:'2026-10-19T12:00:00Z',files:[]};}},
    Blob,Date,Intl,setTimeout(){},clearTimeout(){}
  });
  for(const file of ['js/core.js','js/data/indicators.js','js/app.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
  return {app,calls};
}

test('printing opens before PDF generation or upload finishes and archives the same snapshot',async()=>{
  const pdf=deferred(),{app,calls}=load({generate:()=>pdf.promise});
  app.generalInfo.value.countryCode='BOL';app.generalInfo.value.facilityName='Hospital internacional';
  await app.printReport();
  assert.equal(calls.printed.length,1);assert.equal(calls.saved.length,0);assert.equal(app.archiveBusy.value,true);
  assert.equal(calls.printed[0][1],'BOL-Hospital_internacional');assert.equal(calls.printed[0][0],calls.generated[0]);
  assert.equal(calls.serialized,1);
  app.generalInfo.value.facilityName='Cambio posterior';
  await app.printReport();assert.equal(calls.printed.length,1);
  pdf.resolve(new Blob(['pdf']));await flush();
  assert.equal(calls.saved.length,1);assert.equal(calls.saved[0].dataset.generalInfo.facilityName,'Hospital internacional');
  assert.equal(app.archiveBusy.value,false);assert.equal(app.printBusy.value,false);
});

test('upload failure does not prevent printing and its retry reuses the generated PDF',async()=>{
  let fail=true;
  const {app,calls}=load({save:async()=>{if(fail)throw new Error('Upload unavailable');return {savedAt:'2026-10-19T12:00:00Z',files:[]};}});
  await app.printReport();await flush();
  assert.equal(calls.printed.length,1);assert.equal(app.archiveFailed.value,true);assert.equal(app.archiveBusy.value,false);
  fail=false;await app.retryArchive();
  assert.equal(calls.generated.length,1);assert.equal(calls.saved.length,2);assert.equal(app.archiveFailed.value,false);
});

test('preparation prevents duplicate clicks and releases the print lock after an error',async()=>{
  const html=deferred(),{app,calls}=load({serialize:()=>html.promise});
  const first=app.printReport();await flush();
  assert.equal(app.printBusy.value,true);await app.printReport();assert.equal(calls.serialized,1);
  html.reject(new Error('Image not ready'));await first;
  assert.equal(app.printBusy.value,false);assert.equal(calls.printed.length,0);assert.equal(calls.generated.length,0);
});

test('export downloads JSON and archives PDF without opening preview or calling print',async()=>{
  const pdf=deferred();let rendering;
  const {app,calls}=load({serialize:async()=>{rendering=app.reportRendering.value;assert.equal(app.reportPreview.value,false);return '<html>Hidden report</html>';},generate:()=>pdf.promise});
  app.activeView.value='general';
  const exporting=app.exportData();await flush();
  assert.equal(calls.downloads,1);assert.equal(rendering,true);assert.equal(app.reportRendering.value,false);
  assert.equal(app.reportPreview.value,false);assert.equal(app.activeView.value,'general');assert.equal(calls.printed.length,0);
  pdf.resolve(new Blob(['pdf']));await exporting;
  assert.equal(calls.saved.length,1);assert.equal(calls.generated[0],'<html>Hidden report</html>');
  assert.equal(app.reportPreview.value,false);assert.equal(app.activeView.value,'general');assert.equal(calls.printed.length,0);
});

test('failed export preparation removes offscreen rendering without changing the current view',async()=>{
  const {app,calls}=load({serialize:async()=>{throw Error('Image unavailable');}});
  app.activeView.value='dashboard';await app.exportData();
  assert.equal(app.reportRendering.value,false);assert.equal(app.reportPreview.value,false);
  assert.equal(app.activeView.value,'dashboard');assert.equal(calls.printed.length,0);assert.equal(app.archiveFailed.value,true);
});
